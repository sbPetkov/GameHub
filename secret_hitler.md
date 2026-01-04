Secret Hitler – Implementation Guide (GameHub)

This document describes how to implement Secret Hitler inside your GameHub (Node.js + React + Socket.IO) project.

It focuses on:
	•	Game models & state
	•	Server-side logic (authoritative)
	•	Socket events
	•	UI flow (phone-on-table friendly)
	•	Step-by-step game phases

This guide assumes:
	•	Players are physically in the same room
	•	No private chat between players
	•	Phones are used as personal hidden UI (roles, cards, actions)

⸻

1. Core Design Principles
	1.	Server is authoritative
	•	All roles, decks, powers, and rules live on the server
	•	Clients only receive what they are allowed to see
	2.	Hidden information UI-first
	•	Roles & cards shown only after press-and-hold or tap-to-reveal
	•	Auto-hide after release / timeout
	3.	State machine driven
	•	Game progresses through strict phases
	•	Clients render UI based on game.phase
	4.	Sockets only
	•	No REST for gameplay
	•	Socket.IO rooms = one game table

⸻

2. Game Models (Server)

2.1 Player Model

Player {
  id: string
  socketId: string
  name: string

  role: 'LIBERAL' | 'FASCIST' | 'HITLER'
  party: 'LIBERAL' | 'FASCIST'

  alive: boolean

  hasBeenInvestigated: boolean

  isPresident: boolean
  isChancellor: boolean

  termLimited: boolean
}

Notes:
	•	role is never sent to other players
	•	party may be revealed only via Investigate power
	•	Hitler’s party is Fascist (important)

⸻

2.2 Game Model

Game {
  id: string
  roomCode: string

  players: Player[]

  phase:
    | 'LOBBY'
    | 'ROLE_REVEAL'
    | 'ELECTION_NOMINATION'
    | 'VOTING'
    | 'LEGISLATIVE_PRESIDENT'
    | 'LEGISLATIVE_CHANCELLOR'
    | 'EXECUTIVE_ACTION'
    | 'GAME_OVER'

  presidentIndex: number
  lastPresidentId?: string
  lastChancellorId?: string

  policyDeck: Policy[]
  discardPile: Policy[]

  liberalPolicies: number
  fascistPolicies: number

  electionTracker: number

  pendingPower?: ExecutivePower

  legislativeSession?: {
    presidentCards: Policy[]
    chancellorCards: Policy[]
  }
}


⸻

2.3 Policy Model

Policy = 'LIBERAL' | 'FASCIST'

Deck composition:
	•	6 Liberal
	•	11 Fascist

⸻

2.4 Executive Powers

ExecutivePower =
  | 'INVESTIGATE_LOYALTY'
  | 'SPECIAL_ELECTION'
  | 'POLICY_PEEK'
  | 'EXECUTION'
  | 'VETO_ENABLED'

Power availability depends on:
	•	Player count
	•	Fascist policy track

⸻

3. Game Setup Flow

3.1 Lobby Phase
	•	Players join via room code
	•	Host starts game

Server validates:
	•	Player count: 5–10 only

⸻

3.2 Role & Party Assignment

Steps:
	1.	Build role list based on player count
	2.	Shuffle roles
	3.	Assign each player:
	•	Secret Role
	•	Party Membership

Role distribution example (7 players):
	•	4 Liberals
	•	2 Fascists
	•	1 Hitler

⸻

3.3 Fascist Information Phase

Server sends private socket events:
	•	Fascists receive:
	•	List of fascists
	•	Hitler identity
	•	Hitler receives:
	•	Nothing (7–10 players)
	•	Fascists only in 5+ player games

Clients show this info using press-and-hold reveal UI.

⸻

4. Game Loop (Round by Round)

Each round follows this strict order:

Election → Legislative → Executive → Next Round


⸻

5. Election Phase

5.1 Pass Presidency
	•	presidentIndex = (presidentIndex + 1) % alivePlayers

⸻

5.2 Nominate Chancellor

President selects eligible player.

Eligibility rules enforced server-side:
	•	Cannot nominate last elected President or Chancellor
	•	Exception when 5 players alive
	•	Ignored after election tracker chaos

Socket event:

nominate_chancellor({ targetPlayerId })


⸻

5.3 Voting

All alive players vote simultaneously:
	•	JA / NEIN

Server waits for all votes, then resolves:
	•	Majority JA → Government elected
	•	Tie or majority NEIN → Fail

On fail:
	•	electionTracker++
	•	Rotate President

⸻

5.4 Chaos (3 Failed Elections)

If electionTracker === 3:
	1.	Reveal top policy
	2.	Enact automatically
	3.	Ignore any executive power
	4.	Reset election tracker
	5.	Clear term limits

⸻

6. Legislative Session

6.1 President Draws Cards

Server:
	•	Draw top 3 policies
	•	Send only to President (private)

President UI:
	•	Press-and-hold to reveal cards
	•	Select 1 to discard

⸻

6.2 Chancellor Chooses Policy

Server sends remaining 2 cards to Chancellor.

Chancellor:
	•	Discards 1
	•	Enacts 1

Rules enforced:
	•	No random discard
	•	No order manipulation

⸻

6.3 Veto Power

Enabled after 5 Fascist policies.

Flow:
	1.	Chancellor requests veto
	2.	President accepts or denies
	3.	If accepted:
	•	Discard both
	•	Advance election tracker

⸻

7. Executive Action Phase

Triggered only if:
	•	Fascist policy with power enacted

Server determines power type and pauses game.

7.1 Investigate Loyalty
	•	President selects target
	•	Server sends party only to President
	•	Target marked hasBeenInvestigated = true

⸻

7.2 Special Election
	•	President selects next President
	•	Temporary override of rotation

⸻

7.3 Policy Peek
	•	President sees top 3 policies (order preserved)

⸻

7.4 Execution
	•	President selects player
	•	Player marked alive = false

If Hitler → Liberals win immediately.

Executed player:
	•	UI locked
	•	No further interaction

⸻

8. Win Conditions

Checked after every relevant action.

Liberal Victory
	•	5 Liberal policies enacted
	•	Hitler executed

Fascist Victory
	•	6 Fascist policies enacted
	•	Hitler elected Chancellor after 3 Fascist policies

⸻

9. Socket Event Map (Minimal)

// Game flow
start_game
next_phase

// Election
nominate_chancellor
cast_vote

// Legislative
discard_policy_president
discard_policy_chancellor
request_veto
respond_veto

// Executive
investigate_player
special_election
execute_player

// UI
reveal_role
reveal_cards


⸻

10. Client UI Guidelines (Important)

10.1 Role Reveal
	•	Press & hold to show role
	•	Release hides immediately
	•	Auto-hide after 3–5 seconds

10.2 Card Handling
	•	Cards never shown in lists
	•	Shown as large single cards
	•	Touch-to-select, not swipe

10.3 Table Mode
	•	Big status screen:
	•	Current President / Chancellor
	•	Vote results
	•	Policy tracks
	•	Personal phone:
	•	Hidden info only

⸻

11. Anti-Cheating Assumptions

Because players are co-located:
	•	No screenshots prevention needed
	•	Trust-based physical play
	•	UX discourages accidental reveals

⸻

12. Extensibility Notes

Easy future additions:
	•	Timer per phase
	•	Game history log
	•	Spectator mode
	•	AI narrator (like official app)

⸻

13. Final Notes

Secret Hitler is perfectly suited for GameHub:
	•	Hidden info
	•	Strong social interaction
	•	Minimal UI complexity
