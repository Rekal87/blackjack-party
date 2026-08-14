# Blackjack Party

A lean-classic blackjack game for a group of friends to play together over the internet. No real money — bragging rights only.

## Language

**Hand**:
The set of cards a player or the dealer holds, valued against 21.
_Avoid_: Cards, pile

**Dealer**:
The house position that plays by fixed rules (stands on a hard 17, no choices).
_Avoid_: House, AI

**Hit**:
Take one more card onto the current hand.

**Stand**:
Keep the current hand as-is and end your turn on it.

**Double**:
Double the hand's bet in exchange for exactly one more card.

**Split**:
When a hand's first two cards are a pair, split them into two separate hands, each played independently.
_Avoid_: Split hand

**Natural**:
A starting hand of exactly 21 (an Ace with a ten-valued card). Pays 3:2.
_Avoid_: Blackjack

**Bust**:
A hand whose value exceeds 21. Busting loses the hand immediately.

**Push**:
A player hand and the dealer hand with equal values. The bet is returned, nobody wins.

**Bet**:
Chips a player wagers on a hand before the cards are dealt.

**Chip**:
A unit of the fake currency each player starts with. No cash value, ever.
_Avoid_: Money, coin, credit

**Bankroll**:
A player's stack of chips. Depleted by losing bets, topped up by winning.
_Avoid_: Balance, wallet

**Room**:
An instance of a game that friends join to play together. Identified by a join code.
_Avoid_: Lobby, table, game

**Host**:
The player who created the Room. Starts the game and can end it; otherwise a regular player. If the Host drops out, the Host role passes to the next player.
_Avoid_: Admin, owner

**Spectator**:
A person in the Room who is not playing the current Table — either a friend who joined late or a player who busted out. Watches the action, re-enters on the next Table.
_Avoid_: Viewer, observer

**Table**:
One playthrough of the game within a Room, from the first deal to the last player standing. After a Table ends, the Host starts a new Table with fresh starting stacks.
_Avoid_: Game, round

**Round**:
A single deal-and-settle cycle within a Table: bets placed, cards dealt, players act in turn, Dealer plays, all hands resolved.
_Avoid_: Hand (that's a player's set of cards)

**Up card**:
The Dealer's face-up card, visible to everyone during the round.
_Avoid_: Open card

**Hole card**:
The Dealer's face-down card, revealed only when the round resolves.