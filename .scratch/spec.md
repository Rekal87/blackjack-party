# Blackjack Party — spec

## Problem Statement

Friends want a blackjack game to play together over the internet. Real casinos require accounts, money, and gambling — none of which fit a casual friend group. The game should be a fun, low-friction party activity: join with a code, play fake chips, trash-talk, and declare a winner by night's end.

## Solution

A deployable web app where a Host creates a Room, friends join with a room code and display name, and the group plays lean-classic blackjack with Splits for fake chips. A server-authoritative core (ADR-0001) owns all cards, hands, and settlement; clients render a private view of the table and send intents (bet, hit, stand, double, split) over a WebSocket. The last player standing wins the Table; the Host starts fresh Tables with new starting stacks in the same Room.

## User Stories

1. As a player, I want to create a Room with a shareable join code, so that friends can find my game.
2. As a friend, I want to join a Room with a code and a display name, so that I can play without an account.
3. As a friend, I want the Host to be the only one who starts and ends a Table, so that the night isn't chaos.
4. As a Host, I want to start a Table when I'm ready, so that I can wait for friends to join first.
5. As a Host, I want to start a Table with as few as one player (me), so that I can play solo against the Dealer.
6. As a player, I want to be able to leave the Room at any time, so that I'm not trapped in a game.
7. As a player, I want to see the Room's join code while I'm in it, so that I can invite more friends.
8. As a player, I want a late-arriving friend to be able to watch the current Table as a Spectator, so that they can join the next Table.
9. As a Spectator, I want to see the action of the current Table, so that I'm entertained while I wait.
10. As a player, I want to be dealt a Hand of two cards at the start of a Round, so that I can begin playing.
11. As a player, I want everyone to place their Bets simultaneously at the start of a Round, so that no one gets an advantage from turn order.
12. As a player, I want to bet between a table minimum and maximum, so that the stakes stay sane.
13. As a player, I want to Hit my Hand to draw more cards, so that I can improve toward 21.
14. As a player, I want to Stand to keep my Hand as-is, so that I stop drawing.
15. As a player, I want to Double my Bet in exchange for exactly one more card, so that I can press a strong Hand.
16. As a player, I want to Split a paired starting Hand into two Hands, so that I can play both.
17. As a player, I want to Split only once and never re-split, so that the rules stay lean.
18. As a player, I want Split Aces to receive exactly one card each and no further draws, so that the rule stays simple.
19. As a player, I want to not be allowed to Double after a Split, so that the rules stay lean.
20. As a player, I want my Hand's value to count Aces as 1 or 11, so that I get the best possible total.
21. As a player, I want to know when my Hand busts, so that I can stop trying.
22. As a player, I want a natural 21 (Ace + ten-valued card) on my starting Hand to pay 3:2, so that it's rewarded.
23. As a player, I want a split Hand that totals 21 to pay even money, so that only a starting Natural gets the bonus.
24. As a player, I want a push against the Dealer's equal Hand to return my Bet, so that ties are fair.
25. As a player, I want the Dealer to Hit on a soft 17, so that the house edge is preserved.
26. As a player, I want the Dealer to play out its Hand after all players act, so that the Round resolves.
27. As a player, I want the Dealer's Up card visible during the Round, so that I can make informed decisions.
28. As a player, I want the Dealer's Hole card hidden until the Round resolves, so that there's suspense.
29. As a player, I want my Hand to be private during the Round, so that other players can't see my cards.
30. As a player, I want all Hands revealed when the Round resolves, so that everyone sees the outcome.
31. As a player, I want to act in turn order around the table, so that play is orderly.
32. As a player, I want the turn order to rotate each Round, so that no one is permanently last.
33. As a player, I want the next Round to deal automatically after a short beat, so that the game keeps moving.
34. As a player, I want the Dealer to collect losing Bets and pay winning Bets, so that my Bankroll tracks my fortunes.
35. As a player, I want my Bankroll to drop below the minimum Bet to mean I'm out of the Table, so that the stakes stay honest.
36. As a player, I want to spectate once I've busted out, so that I can watch my friends fight for the win.
37. As a player, I want the last player still able to Bet to win the Table, so that there's a clear bragging-rights outcome.
38. As a Host, I want to start a fresh Table with new starting stacks after the previous one ends, so that friends can rematch in the same Room.
39. As a player, I want the game to deal from a single shuffled deck that's reshuffled between every Hand, so that counting is impossible.
40. As a player, I want to be auto-stood if I disconnect mid-Round, so that my Hand isn't ruined and the table moves on.
41. As a player, I want to rejoin the Room and keep my Bankroll after a disconnect, so that a wifi blip isn't fatal.
42. As a Host, I want the Host role to pass to the next player if I leave, so that the Room doesn't die.
43. As a player, I want a sleek casino aesthetic, so that the game feels like a real table.
44. As a player, I want subtle casino sounds with a mute toggle, so that the ambience is optional.
45. As a player, I want the game to work well on a desktop browser, so that I get the full table view.
46. As a player, I want a single Deck that never runs out mid-Round, so that a Round always resolves.
47. As a player, I want to play with up to six friends, so that the whole group fits at one table.

## Implementation Decisions

- **Server-authoritative core** (ADR-0001): the server owns the Deck, every Hand, the Dealer's play, and all settlement. Clients send intents and render state; the server broadcasts per-recipient filtered state snapshots so no client ever receives cards it shouldn't see.
- **Single Bun server** serving both static assets and the WebSocket endpoint. No separate frontend/backend deploy; one process, one port.
- **Room state machine** (`server/room.ts`) is the single testing seam. It accepts intents and emits TableState transitions through phases: `betting → dealing → acting → dealerPlay → resolve`.
- **WebSocket protocol**: client intents `createRoom`, `join`, `startTable`, `placeBet`, `hit`, `stand`, `double`, `split`, `leave`; server events `roomJoined`, `playerJoined`, `playerLeft`, `tableState` (filtered), `error`.
- **Chip economy**: starting Bankroll 1000, Bet min 10 / max 200. Dealer is bottomless (pays out wins and 3:2 Naturals from nothing). Falling below the min Bet removes a player from the Table as a Spectator.
- **Rules**: Dealer Hits soft 17; Natural vs Natural is a Push; split 21s pay 1:1; lean Splits (any pair, once; Aces get one card each; no re-split, no Double-after-Split); single deck reshuffled between every Hand.
- **Turn flow**: simultaneous betting window (~20s) then auto-deal; round-robin acting with no timer (trust-based, auto-stand on disconnect); order rotates each Round; full reveal at resolution.
- **Room lifecycle**: late arrivals Spectate and enter on the next Table; last-one-standing wins; Host starts fresh Tables with fresh starting stacks in the same Room; Host role hands over on departure.
- **Deployment**: free-tier host (Fly.io / Railway / Render) with a persistent WebSocket server. Requires a platform that supports WebSockets; a serverless static-only host is out of scope.
- **Client**: React 19 + Tailwind 4 + shadcn-style components, desktop-first, sleek casino look, subtle sound with mute. No in-game chat (friends use Discord).

## Testing Decisions

- Tests exercise only the external behavior of the Room state machine: feed intents, assert the emitted TableState. No peeking at implementation internals.
- The Room state machine is the highest seam (ADR-0001 puts all card knowledge server-side), so its tests cover dealing, hand values, splits, double, dealer play (soft 17), settlement (win/lose/push, 3:2, split-21), natural-vs-natural, bankroll flow, auto-stand on disconnect, host handover, last-one-standing, and per-recipient filtering.
- Prior art: none in the repo yet — this is the first test suite. Use Bun's built-in test runner (`bun test`).

## Out of Scope

- Real money, accounts, or authentication
- In-game chat or emotes
- Multi-deck shoes, insurance, surrender, or any casino rule beyond the lean set
- Mobile-first layout tuning beyond desktop-first responsive polish
- Spectator joining mid-Round as a player; spectators enter only on the next Table
- Replay, stats, or history across Tables

## Further Notes

- Glossary of domain terms lives in `CONTEXT.md`; use its vocabulary (Hand, Dealer, Room, Table, Round, Up card, Hole card, Bankroll, etc.) in all tickets and code.
- The single-deck, reshuffle-every-Hand decision intentionally removes card-counting concerns from the Dealer's play.
- A "short beat" for auto-deal implies a bounded betting window; treat it as ~20 seconds, tune later.