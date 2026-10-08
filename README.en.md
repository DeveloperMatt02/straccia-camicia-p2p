<p align="center">
  <img src="docs/social-preview.jpg" alt="Straccia Camicia, the Italian card game online" width="820">
</p>

<p align="center">
  <b>The Italian card game, online with friends.</b><br>
  Everyone plays from their own phone or computer, 2 to 6 players. Free, no sign-up, no server.
</p>

<p align="center">
  <a href="https://TUO-NOME-UTENTE.github.io/straccia-camicia/"><b>Play now</b></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="README.md">Versione italiana</a>
</p>

---

<table align="center">
  <tr>
    <td align="center"><img src="docs/screenshots/table-en.jpg" width="190" alt="The table in English with Piacentine cards"></td>
    <td align="center"><img src="docs/screenshots/stanza.jpg" width="190" alt="The room with the code to share"></td>
    <td align="center"><img src="docs/screenshots/tavolo.jpg" width="190" alt="The table during a game"></td>
    <td align="center"><img src="docs/screenshots/fine.jpg" width="190" alt="End of the game with tonight's standings"></td>
  </tr>
</table>

## What it is

Straccia Camicia ("tear the shirt") is the Italian cousin of Beggar-My-Neighbour, the card game many Italians learned as kids with the 40-card regional deck. This version is for playing apart: one person creates a room, sends the link to the group, and everyone turns their own cards on their own phone.

- **Online with friends**: a room with a 4-letter code or a shareable link, 2 to 6 players.
- **Runs anywhere**: phone, tablet and computer, straight from the browser. You can add it to your home screen like an app.
- **Actually free**: it's a static site on GitHub Pages and the devices talk directly to each other, so there's no server to pay for.
- **The full rules**, plus regional variants you pick per room.
- **Real cards**: Neapolitan and Piacentine decks from scans of actual printed decks, plus a modern style with big numbers that reads well on a phone. Everyone picks their own.
- **Italian and English**: everyone picks their own language, even in the same game.
- **Taunts, sound and vibration**, tonight's standings and instant rematches.
- **Play against the computer** to learn the rules on your own, even offline.

## The rules

It's played with the 40-card Italian deck (cups, coins, clubs and swords). The cards are dealt face down and nobody looks at their own pile.

1. Taking turns, each player turns the top card of their pile onto the middle of the table.
2. Aces, twos and threes make you pay: the next player must turn 1, 2 or 3 cards.
3. If an ace, two or three comes up while you're paying, you stop and the next player has to pay you.
4. If you finish paying without a good card, whoever played the last paying card takes the whole pile, puts it under their cards and starts again.
5. A player who has to play but has no cards left is out, "left in their shirt". Whoever wins every card wins the game.

### Room variants

| Variant | How it works |
| --- | --- |
| Sicilian slap | Two cards of the same value on top of each other: the first to slap takes the pile. A wrong slap costs a card. |
| Pace | Free, 6 seconds, or Calabrian (2.5 seconds): when time runs out the card turns itself. |
| Decks | 1, 2 or 3 decks together (40, 80, 120 cards), like the Super Camicia played in Valtellina. |
| Forfeit | Veneto style: at the end, the losers see their shirt torn to pieces. |

Slaps are fair across different connections: the fastest reflex measured on each player's own device wins, not the fastest network.

There's also a known card arrangement that makes the game go on forever, found in 2017 after being an open problem. If it happens, the game notices and calls a draw.

## Playing online

1. Open the site, type your name and tap **Create a room**.
2. Use **Invite friends** to send the link to the group, or read out the code.
3. When everyone's in, pick the rules and tap **Deal the cards**.

Controls: tap your pile to turn a card, the hand button to slap. On a computer, Space and B work too.

Good to know: the table lives on the device of whoever created the room, so they need to keep the page open. If someone else drops out, their cards keep playing on their own, and reopening the same link puts them back in their seat.

If someone can't join, their network may be blocking direct connections (some university or office networks do). Switch to mobile data, or add a free TURN server in [`js/config.js`](js/config.js) as explained at the top of that file.

## Host your own copy

No build step, no dependencies. Fork the repository, then go to **Settings → Pages**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and save. To run it locally, serve the folder with any static server (for example `python3 -m http.server`).

The code is plain JavaScript: rules in [`js/engine.js`](js/engine.js), the room in [`js/room.js`](js/room.js), networking with [PeerJS](https://peerjs.com) in [`js/net.js`](js/net.js), the cards in [`js/cards.js`](js/cards.js) and [`carte/`](carte), translations in [`js/i18n.js`](js/i18n.js). Run the tests with `npm test`.

## Credits

Rules from the Italian Wikipedia article [Straccia camicia](https://it.wikipedia.org/wiki/Straccia_camicia). The endless game is the one found with [drago-96/cavacamisa](https://github.com/drago-96/cavacamisa). Neapolitan cards: scans of a Dal Negro deck by Trocche100; Piacentine cards: scan by Florixc; both public domain, from Wikimedia Commons (details in [`carte/CREDITI.md`](carte/CREDITI.md)). Peer-to-peer networking by [PeerJS](https://github.com/peers/peerjs) (MIT).

## License

[MIT](LICENSE).
