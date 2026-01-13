
## 1. Game Overview

Werewolves is a **social deduction game** for **4+ players**.

### Teams
- **Villagers**
- **Werewolves**

---

## 2. Room & Lobby Flow

### 2.1 Room Creation
- Admin creates a room
- Server generates a **unique room code**
- Room enters **Lobby state**

### 2.2 Joining a Room
Players join by:
- Entering room code

## 3. Role Configuration (Admin)

Before the game starts, the Admin:

- Selects which roles are active
- Chooses number of Werewolves
- Optionally enables:
  - Cupid
  - Witch
  - Seer
  - Healer
  - Hunter
  - Mayor
  - Red Riding Hood

## 4. Game Start

When Admin clicks **Start Game**:
1. Roles are randomly assigned
2. Each player privately sees their role
3. Game immediately enters **Night 1**

---

## 5. Night Phase (Timed & Sequential)

If there is Cupid game startis with screen where the cupid selects 2 players to be inlove others wait for the cupid to finish. 

### General Rules
- All players are muted
- Only the active role receives UI controls
- All night actions are **server-authoritative**

### Night Timers
| Role | Time |
|----|----|
| Werewolves | **20 seconds** |
| Other roles | **30 seconds** |


If a player does not act in time:
- Action is skipped
- Game proceeds automatically

---

## 6. Night Phase – First Night Order

### 6.1 Cupid (Optional)
⏱️ 30 seconds

- Selects **two players** (may include self)
- Selected players become **Lovers**
- Lovers are privately revealed to each other
- If one Lover dies, the other dies immediately

Cupid acts **only once**.

---

### 6.2 Werewolves
⏱️ 20 seconds

- All Werewolves wake together
- They see each other
- They vote for **one victim**
- Majority vote decides
- No majority → no kill

Target is stored but **not revealed yet**.

---

### 6.3 Seer
⏱️ 30 seconds

- Selects one player
- Server returns:
  - `Werewolf` or `Not Werewolf`
- Result is visible **only to the Seer**

---

### 6.4 Witch
⏱️ 30 seconds

The Witch:
- Sees the Werewolves’ target
- Has:
  - 🧪 1 Healing Potion
  - ☠️ 1 Poison Potion
- Each potion can be used **once per game**

Actions:
1. Heal victim? (Yes / No)
2. Poison another player? (Optional)

---

### 6.5 Healer
⏱️ 30 seconds

- Protects one player
- If that player is the Werewolf target → survives
- Cannot protect the same player two nights in a row
- Does NOT block Witch poison

---

## 7. Night Phase – Following Nights

From Night 2 onward:
1. Werewolves
2. Seer
3. Witch (if potions remain)
4. Healer

Cupid, Mayor, Hunter, Red Riding Hood are not awakened.

---

## 8. Day Phase

### 8.1 Death Resolution Order
At the start of Day:
1. Witch poison deaths
2. Werewolf kill (unless saved)
3. Lover chain deaths
4. Hunter death shot (instant)

Dead players:
- Reveal role
- Become spectators
- Cannot vote or talk

---

## 9. Discussion Phase and Voting (Lynching)

- All living players may speak
- No private messages
- Werewolves must lie and mislead


### Voting Flow
1. alive players nominates(vote) another, when everyone casts their vote the vote is finished
3. Nominated player gives defense
4. Open vote > everyone vote if this player is lynched or not
   - 👍 Lynch
   - 👎 Spare

### Results
- Majority 👍 → player is lynched
- Tie → Mayor vote counts double
- No lynch → Day ends

---

## 11. Roles

### Villager (+1)
No ability. Find and lynch Werewolves.

### Werewolf (-6)
Night kill. Win if all others die.

### Seer (+7)
Checks one player per night.

### Witch (+5)
1 heal + 1 poison. Sees Werewolf target.

### Healer (+3)
Protects one player per night.

### Cupid (-2)
First night only. Links Lovers.

### Hunter (+3)
On death, instantly kills one player.

### Red Riding Hood (+3)
Immune to Werewolves while Hunter lives.

### Mayor (+2)
Vote counts double in ties.

---

## 12. Win Conditions

### Villagers Win
- Last Werewolf is dead

### Werewolves Win
- Only Werewolves remain alive

---

## 14. End of Game
- Winning team revealed
- All roles shown
- Option to restart with same room

---

🐺 **Trust no one. Silence is also a strategy.**