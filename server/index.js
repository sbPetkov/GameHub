require('dotenv').config();
const express = require('express');
const http = require('http');
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
