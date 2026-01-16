🎉 GameHub Party Wheel Game

Overview

A casual, friend-first party game designed for 2–10 players. The game focuses on fun, speed, and social interaction rather than strict competitiveness. Players take turns spinning a wheel to receive random question-based challenges across multiple media-rich categories (music, movies, images, trivia, etc.).

Answer validation is social: other players vote to decide whether an answer counts.

⸻

Core Game Principles
	•	Party-first, not competitive
	•	Trust-based (friends playing together)
	•	Fast rounds, minimal downtime
	•	Forgiving answer validation
	•	Media-rich (audio, images, emojis)

⸻

Game Flow

1. Lobby Phase
	•	2–10 players join a lobby
	•	One player is the host
	•	Host starts the game

⸻

2. Turn Order
	•	Turn order is randomized at game start
	•	Players rotate clockwise

⸻

3. Player Turn Flow

Step 1 — Spin the Wheel
	•	Active player sees a wheel with categories
	•	Center button: GO
	•	Wheel spins and randomly selects a category

Step 2 — Load Challenge
	•	Wheel stops
	•	Button changes to ANSWER
	•	On click:
	•	Question/media is revealed
	•	Player’s personal timer starts

Step 3 — Answer Phase
	•	Player types a free-text answer
	•	Player has a total time bank (default: 3 minutes for the entire game)
	•	Timer runs only while answering
	•	Player submits answer → timer stops immediately

Step 4 — Social Validation (Voting)
	•	Other players see:
	•	Player’s submitted answer
	•	Official correct answer
	•	Other players vote:
	•	✅ PASS
	•	❌ FAIL

Voting Rule:
	•	As soon as 50% of the remaining players vote PASS, the vote ends immediately and the answer is accepted
	•	Active player cannot vote
	•	FAIL votes do not block early resolution
	•	If time expires without enough PASS votes → answer fails

Step 5 — Resolution
	•	PASS → points awarded
	•	FAIL → no points
	•	Optional animations/sounds play
	•	Turn passes to next player

⸻

4. Time Bank Rules
	•	Each player starts with 3 minutes total
	•	Time is shared across all turns
	•	If a player’s time reaches 0:
	•	They are skipped
	•	OR they may buy 1 extra minute for a fixed point cost (e.g. 15 points)

⸻

Categories (Initial Set)

🎵 Guess the Song
	•	Plays ~5-second .wav snippet
	•	Player guesses:
	•	Song name
	•	(Optional bonus) Artist

🎬 Guess the Movie by Emojis
	•	Movie represented by emojis

🌍 Guess the Country by Images
	•	Two images representing a country

⭐ Guess the Famous Person
	•	Short bio or clues

❓ Trivia Question
	•	General knowledge questions with predefined answers

⸻

Answer Validation Philosophy
	•	No automatic strict validation
	•	Group consensus decides correctness
	•	Typos, slang, partial answers are acceptable
	•	Designed for friends, not trolls

⸻

Media & Content Storage Structure

/game-content
│
├── mapping.json
│
├── songs/
│   ├── smells_like_teen_spirit.wav
│   ├── billie_jean.wav
│
├── countries/
│   ├── japan/
│   │   ├── img1.jpg
│   │   ├── img2.jpg
│   ├── italy/
│   │   ├── img1.jpg
│   │   ├── img2.jpg
│
├── movies/
│   ├── movie_emojis.json
│
├── trivia/
│   ├── questions.json


⸻

Mapping File (mapping.json)

Single source of truth describing all questions and media.

Example Structure

{
  "songs": [
    {
      "id": "song_001",
      "song": "Smells Like Teen Spirit",
      "artist": "Nirvana",
      "file": "songs/smells_like_teen_spirit.wav"
    }
  ],

  "countries": [
    {
      "id": "country_001",
      "country": "Japan",
      "images": [
        "countries/japan/img1.jpg",
        "countries/japan/img2.jpg"
      ]
    }
  ],

  "movies": [
    {
      "id": "movie_001",
      "movie": "The Matrix",
      "emojis": "🕶️💊🖥️"
    }
  ],

  "trivia": [
    {
      "id": "trivia_001",
      "question": "What is the capital of France?",
      "answer": "Paris"
    }
  ]
}


⸻

UI Description

Lobby UI
	•	Player list with avatars
	•	Host indicator
	•	Start Game button

⸻

Main Game UI

Center
	•	Large spinning wheel with categories
	•	Center button:
	•	GO → spin
	•	ANSWER → reveal question

Top
	•	Current player name
	•	Remaining personal time bank

Question Area
	•	Displays:
	•	Audio player (songs)
	•	Images (countries)
	•	Emojis (movies)
	•	Text (trivia)

Answer Input
	•	Large text input
	•	Submit button

⸻

Voting UI
	•	Shows player answer + correct answer
	•	PASS / FAIL buttons
	•	Vote progress indicator (e.g. 2 / 3 PASS)
	•	Early resolution animation

⸻

Feedback & Animations
	•	Confetti on PASS
	•	Fun sound effects
	•	Friendly messages (“Close enough!”, “Nice one!”)

⸻

Non-Goals (For Now)
	•	No stealing points
	•	No golden categories
	•	No competitive ranking
	•	No strict AI validation

⸻

Summary

This game is designed to be:
	•	Easy to understand
	•	Easy to extend
	•	Fun with friends
	•	Media-driven
	•	Socially validated

Perfect for GameHub-style casual multiplayer experiences.