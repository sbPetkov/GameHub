require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { GoogleGenAI } = require('@google/genai');
const { initDb } = require('./database');

const app = express();
const server = http.createServer(app);

// Initialize Gemini AI
const API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Serve Images for games
app.use('/images', express.static(path.join(__dirname, 'Images')));
app.use('/uploads', express.static(path.join(__dirname, 'data/uploads')));

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for now, restrict in production
    methods: ["GET", "POST"]
  }
});

let db;

// Initialize Database
initDb().then(_db => {
  db = _db;
  console.log('Database initialized');
});

// Routes

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Gemini API Hint Route
app.post('/api/hint', async (req, res) => {
    const { word, category } = req.body;
    if (!word) return res.status(400).json({ error: 'Word is required' });

    const prompt = `Describe the word "${word}" (category: ${category}) in Bulgarian in 2-3 sentences without using the word itself or its root. The description should be a hint for a game of Associations.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        if (response && response.text) {
            res.json({ hint: response.text });
        }
        else {
            res.status(500).json({ error: 'Failed to generate hint' });
        }
    } catch (error) {
        console.error('Gemini SDK Error:', error.message);
        res.status(500).json({ error: 'Error fetching hint from AI' });
    }
});

// Register
app.post('/api/register', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(
      'INSERT INTO users (email, password, username) VALUES (?, ?, ?)',
      [email, hashedPassword, username]
    );
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        games_played: user.games_played,
        wins: user.wins 
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get User Profile (Protected)
app.get('/api/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.get('SELECT id, username, email, games_played, wins FROM users WHERE id = ?', [decoded.id]);
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Check Active Game
app.get('/api/active-game', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.get('SELECT username FROM users WHERE id = ?', [decoded.id]);
    
    if (user) {
        const room = roomManager.findRoomByUser(user.username);
        if (room) {
            return res.json({ 
                active: true, 
                roomId: room.id, 
                gameType: room.gameType 
            });
        }
    }
    res.json({ active: false });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// File Upload for Custom Games
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed (no videos or documents)'), false);
        }
    }
});

app.post('/api/upload-game-images', upload.array('files', 10), async (req, res) => {
    const { roomId, username } = req.body;
    
    if (!roomId || !username || !req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const room = roomManager.getRoom(roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    // Check if game supports uploads
    if (typeof room.game.handleImageUpload !== 'function') {
        return res.status(400).json({ error: 'Game does not support uploads' });
    }

    const uploadDir = path.join(__dirname, 'data/uploads', roomId);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const processedFiles = [];

    try {
        for (const file of req.files) {
            const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
            const filepath = path.join(uploadDir, filename);

            let inputBuffer = file.buffer;

            // Check if HEIC
            const isHeic = file.mimetype === 'image/heic' || 
                           file.mimetype === 'image/heif' || 
                           file.originalname.toLowerCase().endsWith('.heic') || 
                           file.originalname.toLowerCase().endsWith('.heif');

            if (isHeic) {
                try {
                    inputBuffer = await heicConvert({
                        buffer: file.buffer,
                        format: 'JPEG',
                        quality: 1
                    });
                } catch (convErr) {
                    console.error("HEIC conversion failed", convErr);
                    // If simple conversion fails, try passing original to sharp as fallback or skip
                    continue; 
                }
            }

            // Process image: Resize to max 1024x1024, convert to JPEG
            await sharp(inputBuffer)
                .rotate() // Auto-rotate based on EXIF
                .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(filepath);

            processedFiles.push(`${roomId}/${filename}`);
        }

        // Notify Game Logic
        room.game.handleImageUpload(username, processedFiles);
        
        // Notify Room (Game logic usually emits update, but we might want explicit ack here or just rely on game update)
        // CodebreakersCustom should emit 'game_update' inside handleImageUpload.

        res.json({ success: true, count: processedFiles.length });
    } catch (err) {
        console.error('Image processing error:', err);
        res.status(500).json({ error: 'Failed to process images' });
    }
});

const RoomManager = require('./managers/RoomManager');
const roomManager = new RoomManager(io, ai);

// Socket.io Events
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('create_room', ({ gameType, username }, callback) => {
    try {
      const roomId = roomManager.createRoom(socket.id, gameType);
      roomManager.joinRoom(socket, roomId, username);
      callback({ roomId });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('join_room', ({ roomId, username }, callback) => {
    const result = roomManager.joinRoom(socket, roomId, username);
    if (result.error) {
      callback({ error: result.error });
    } else {
      callback({ success: true, room: result.room, gameState: result.gameState });
    }
  });

  socket.on('make_move', ({ roomId, moveData }) => {
    roomManager.handleMove(socket.id, roomId, moveData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    roomManager.leaveRoom(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
