// "Learn to play" lessons for complete beginners: the board, how each piece moves, and the rules.
// Every exercise is played on the board. scripts/check-basics.ts checks each one is legal and solvable.
//
// Exercise kinds:
//   squares — click the named squares (learn the coordinates)
//   stars   — move one piece to collect every star (and capture any black pieces), in as few moves as you can
//   move    — a real position: make the move that meets the goal
//   info    — a picture and some words, then Next

export type Role = "R" | "B" | "Q" | "K" | "N" | "P";
export type Goal =
  | { accept: string[] } // SAN, with or without +/#
  | "mate"
  | "check"
  | "escape-king" // get out of check by moving the king
  | "escape-block" // ...by putting a piece in the way
  | "escape-capture"; // ...by taking the checking piece

export type Exercise =
  | { kind: "info"; text: string; fen?: string; moves?: string; arrows?: [string, string][]; marks?: string[] }
  | { kind: "squares"; text: string; count: number }
  | { kind: "stars"; text: string; piece: Role; from: string; stars: string[]; blockers?: string[]; enemies?: string[] }
  | { kind: "move"; text: string; fen?: string; moves?: string; goal: Goal; wrong?: Record<string, string>; done: string; hint?: string };

export type Basics = { id: string; title: string; blurb: string; icon: string; exercises: Exercise[] };

export const BASICS: Basics[] = [
  {
    id: "board", title: "The chessboard", icon: "Grid3x3",
    blurb: "64 squares, and a name for every one of them.",
    exercises: [
      { kind: "info", text: "The board has 8 columns, called files, lettered a to h, and 8 rows, called ranks, numbered 1 to 8. Every square is named by its file then its rank, so the square in the bottom-left corner is a1. White always starts at the bottom, and there's always a light square in each player's bottom-right corner.", marks: ["a1", "h1", "e4"] },
      { kind: "info", text: "This is how a game starts. White's pieces fill ranks 1 and 2, Black's fill ranks 7 and 8. White always moves first, then the players take turns.", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
      { kind: "squares", text: "Find the square! Click the square named below. The letters and numbers on the edge of the board will help.", count: 8 },
    ],
  },
  {
    id: "rook", title: "The rook", icon: "Castle",
    blurb: "Straight lines, as far as it likes.",
    exercises: [
      { kind: "stars", text: "The rook moves in straight lines: up, down, left or right, as many squares as it likes. Move it to the star.", piece: "R", from: "a1", stars: ["a6"] },
      { kind: "stars", text: "Collect both stars. Try to use as few moves as you can.", piece: "R", from: "a1", stars: ["a5", "e5"] },
      { kind: "stars", text: "Three stars this time.", piece: "R", from: "d4", stars: ["d8", "h8", "h1"] },
      { kind: "stars", text: "A rook can't jump over pieces, not even its own. Find a way around your pawns.", piece: "R", from: "a1", stars: ["a6"], blockers: ["a4", "c1"] },
      { kind: "stars", text: "Capture by landing on an enemy piece: it's removed from the board. Take both black pieces.", piece: "R", from: "d1", stars: [], enemies: ["d6", "g6"] },
    ],
  },
  {
    id: "bishop", title: "The bishop", icon: "Slash",
    blurb: "Diagonals only, and it never changes colour.",
    exercises: [
      { kind: "stars", text: "The bishop moves diagonally, as far as it likes. Move it to the star.", piece: "B", from: "c1", stars: ["h6"] },
      { kind: "stars", text: "A bishop always stays on squares of the same colour. Collect both stars.", piece: "B", from: "c1", stars: ["a3", "e7"] },
      { kind: "stars", text: "Three stars, all on light squares, like the bishop.", piece: "B", from: "f1", stars: ["b5", "e8", "h5"] },
      { kind: "stars", text: "Your own pawn is in the way. Go around it.", piece: "B", from: "c1", stars: ["e5", "h2"], blockers: ["d2"] },
      { kind: "stars", text: "Capture both black pieces. The first one is in the way of the second.", piece: "B", from: "a1", stars: [], enemies: ["c3", "f6"] },
    ],
  },
  {
    id: "queen", title: "The queen", icon: "Crown",
    blurb: "A rook and a bishop in one: the strongest piece.",
    exercises: [
      { kind: "stars", text: "The queen moves like a rook and a bishop together: straight lines and diagonals, as far as she likes.", piece: "Q", from: "d1", stars: ["d7", "h3"] },
      { kind: "stars", text: "Collect all three stars.", piece: "Q", from: "a1", stars: ["h8", "h1", "a8"] },
      { kind: "stars", text: "Collect the stars and capture the black pieces. She can't jump over anything either.", piece: "Q", from: "d4", stars: ["h8"], blockers: ["d6", "f6"], enemies: ["a7", "g1"] },
    ],
  },
  {
    id: "king", title: "The king", icon: "Shield",
    blurb: "One square at a time. Lose him and you lose the game.",
    exercises: [
      { kind: "stars", text: "The king moves one square in any direction. He's slow, but he's the most important piece: if he's trapped, you lose.", piece: "K", from: "e1", stars: ["e3"] },
      { kind: "stars", text: "Diagonal steps are just as quick as straight ones.", piece: "K", from: "a1", stars: ["d4"] },
      { kind: "stars", text: "Collect both stars.", piece: "K", from: "e4", stars: ["e6", "g6"] },
    ],
  },
  {
    id: "knight", title: "The knight", icon: "Sparkle",
    blurb: "An L-shaped jump over anything in the way.",
    exercises: [
      { kind: "stars", text: "The knight moves in an L: two squares one way, then one square to the side. Move it to the star.", piece: "N", from: "g1", stars: ["f3"] },
      { kind: "stars", text: "The knight is the only piece that can jump over others. Hop over your pawns.", piece: "N", from: "b1", stars: ["c3"], blockers: ["a2", "b2", "c2", "d2"] },
      { kind: "stars", text: "Hop from star to star.", piece: "N", from: "b1", stars: ["c3", "d5", "f6"] },
      { kind: "stars", text: "A knight always lands on the other colour. Squares close by can be surprisingly far away.", piece: "N", from: "a1", stars: ["b2"] },
      { kind: "stars", text: "Capture all three black pieces.", piece: "N", from: "d4", stars: [], enemies: ["e6", "g5", "f3"] },
    ],
  },
  {
    id: "pawn", title: "The pawn", icon: "Footprints",
    blurb: "Forward only, captures diagonally, becomes a queen.",
    exercises: [
      { kind: "stars", text: "Pawns move straight forward one square. On its very first move, a pawn may move two squares.", piece: "P", from: "e2", stars: ["e4"] },
      { kind: "stars", text: "After the first move, it's one square at a time. Pawns never move backwards.", piece: "P", from: "e2", stars: ["e6"] },
      { kind: "stars", text: "Pawns capture one square diagonally forward, never straight ahead. Take the black piece on your way.", piece: "P", from: "d2", stars: ["c5"], enemies: ["c3"] },
      { kind: "stars", text: "A pawn that reaches the far side becomes a queen (or a rook, bishop or knight). That's called promotion. Promote, then use your new queen to grab the last star.", piece: "P", from: "e5", stars: ["e8", "a4"] },
    ],
  },
  {
    id: "capture", title: "Capturing and piece values", icon: "Scale",
    blurb: "Which pieces are worth more, and which ones are safe to take.",
    exercises: [
      { kind: "info", text: "Pieces are worth points, so you can tell whether a trade is good: pawn 1, knight 3, bishop 3, rook 5, queen 9. The king can't be traded at all. Winning even a pawn or two is often enough to win the game.", fen: "7k/8/8/8/8/8/8/1NBRQK2 w - - 0 1" },
      { kind: "move", text: "Your rook can capture two different pieces. Take the more valuable one.", fen: "6k1/8/8/3q4/8/8/8/1n1R2K1 w - - 0 1", goal: { accept: ["Rxd5"] }, wrong: { Rxb1: "A knight is worth 3, the queen is worth 9. Take the queen!" }, done: "You won the queen: 9 points for nothing." },
      { kind: "move", text: "Only one of these pieces is free to take. Don't fall into the trap.", fen: "6k1/8/4p3/3p4/n7/8/8/3Q2K1 w - - 0 1", goal: { accept: ["Qxa4"] }, wrong: { Qxd5: "The pawn on d5 is defended by the pawn on e6. You'd lose your queen (9) for a pawn (1)." }, done: "Right: the knight on a4 was undefended. A piece nobody protects is called hanging." },
    ],
  },
  {
    id: "check", title: "Check", icon: "AlertTriangle",
    blurb: "Attack the king, and how to escape when yours is attacked.",
    exercises: [
      { kind: "move", text: "When a piece attacks the enemy king, that's check. Put the black king in check with your rook.", fen: "4k3/8/8/8/8/8/8/R5K1 w - - 0 1", goal: "check", done: "Check! Black has to deal with it straight away." },
      { kind: "move", text: "Give check with your knight.", fen: "4k3/7p/8/1N6/8/8/P7/6K1 w - - 0 1", goal: "check", done: "Knight checks can't be blocked, because knights jump." },
      { kind: "info", text: "When your king is in check you must get out of check at once. There are three ways: move the king to a safe square, block the check by putting a piece in the way, or capture the piece that's giving check.", fen: "4r1k1/8/8/8/8/8/8/2B1K3 w - - 0 1", arrows: [["e8", "e1"]] },
      { kind: "move", text: "Your king is in check from the rook. Escape by moving the king.", fen: "4r1k1/8/8/8/8/8/8/4K3 w - - 0 1", goal: "escape-king", done: "Safe. A king can never move onto a square that's attacked." },
      { kind: "move", text: "In check again. This time, block it.", fen: "4r1k1/8/8/8/8/8/8/2B1K3 w - - 0 1", goal: "escape-block", wrong: { "*": "That's legal, but this time put your bishop in the way." }, done: "Blocked! The bishop shields the king." },
      { kind: "move", text: "And now escape by capturing the piece that's giving check.", fen: "R3r1k1/8/8/8/8/8/8/4K3 w - - 0 1", goal: "escape-capture", wrong: { "*": "That's legal, but you can do better: take the rook that's checking you." }, done: "The checking rook is gone, and you're a rook up." },
    ],
  },
  {
    id: "checkmate", title: "Checkmate", icon: "Crown",
    blurb: "The goal of the game: a check there's no escape from.",
    exercises: [
      { kind: "info", text: "Checkmate is a check that can't be escaped: the king can't move to safety, the check can't be blocked, and the checking piece can't be captured. Checkmate wins the game. Here Black's own pawns trap the king on the back row.", fen: "R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1" },
      { kind: "move", text: "Checkmate the black king in one move.", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", goal: "mate", done: "Checkmate! This is called a back-rank mate." },
      { kind: "move", text: "Your king and queen work together. Find a checkmate.", fen: "6k1/8/6K1/8/8/8/8/Q7 w - - 0 1", goal: "mate", done: "Checkmate! The king protects the queen and guards the escape squares." },
      { kind: "move", text: "Checkmate in one, with your queen.", fen: "k7/2K5/8/8/3Q4/8/8/8 w - - 0 1", goal: "mate", hint: "Check along the a-file. Your king already covers b7 and b8.", done: "Checkmate!" },
    ],
  },
  {
    id: "special", title: "Special moves", icon: "Wand2",
    blurb: "Castling, promotion and en passant.",
    exercises: [
      { kind: "info", text: "Castling moves your king to safety and brings a rook into play in one move. The king moves two squares towards a rook, and the rook hops over to the other side of it. You can only castle if neither piece has moved yet, the squares between them are empty, and your king isn't in check and doesn't pass through or land on an attacked square.", fen: "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1" },
      { kind: "move", text: "Castle kingside: drag your king two squares to the right.", fen: "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1", goal: { accept: ["O-O"] }, done: "Castled! Your king is tucked away and your rook is ready to join in." },
      { kind: "move", text: "Now castle queenside: king two squares to the left.", fen: "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1", goal: { accept: ["O-O-O"] }, done: "Queenside castling. The rook lands next to the king, in the middle." },
      { kind: "move", text: "Black's bishop attacks f1, so you can't castle kingside here: your king would pass through an attacked square. Castle the other way.", fen: "r3k2r/8/b7/8/8/8/8/R3K2R w KQkq - 0 1", goal: { accept: ["O-O-O"] }, done: "Exactly. Always check the squares your king passes over." },
      { kind: "move", text: "Promote your pawn to a queen.", fen: "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", goal: { accept: ["e8=Q"] }, done: "A brand-new queen!" },
      { kind: "move", text: "A queen isn't always best. Promote to the piece that wins Black's queen.", fen: "8/2q1P1k1/8/8/8/8/8/4K3 w - - 0 1", goal: { accept: ["e8=N"] }, wrong: { "e8=Q": "A queen is usually right, but here a knight checks the king and attacks the queen at the same time. Try a knight." }, hint: "Which piece on e8 would attack both g7 and c7?", done: "A knight fork with check! Black must move the king, and you take the queen." },
      { kind: "move", text: "En passant: when a pawn moves two squares and lands right beside one of your pawns, you may capture it as if it had moved one square, but only on the very next move. Black just played d7-d5. Capture en passant.", fen: "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3", goal: { accept: ["exd6"] }, hint: "Your e5 pawn captures diagonally onto d6, the square the black pawn skipped.", done: "En passant! The black pawn is removed even though you landed behind it." },
    ],
  },
  {
    id: "draws", title: "Stalemate and draws", icon: "Handshake",
    blurb: "Not every game has a winner. Don't throw a win away.",
    exercises: [
      { kind: "info", text: "Stalemate: the player to move is not in check but has no legal move. The game is a draw, even if one side has far more pieces! Here Black to move has no legal moves. Other draws: neither side has enough pieces left to checkmate, the same position appears three times, 50 moves pass with no capture or pawn move, or the players agree to a draw.", fen: "k7/8/1QK5/8/8/8/8/8 b - - 0 1" },
      { kind: "move", text: "Careful: many queen moves here leave Black with no legal move, which is stalemate. Find the checkmate instead.", fen: "7k/5K2/8/8/6Q1/8/8/8 w - - 0 1", goal: "mate", hint: "Give check. Black's king must have no squares to run to.", done: "Checkmate, not stalemate. You won!" },
      { kind: "move", text: "One more: checkmate, and don't stalemate.", fen: "k7/2K5/1P6/8/8/8/8/3R4 w - - 0 1", goal: "mate", done: "Checkmate! Always ask yourself: after my move, does my opponent have any legal move at all?" },
    ],
  },
  {
    id: "principles", title: "Opening principles", icon: "Flag",
    blurb: "How to start a game well without memorising anything.",
    exercises: [
      { kind: "info", text: "Three rules carry you through the opening of any game: 1. Control the centre (the four squares d4, e4, d5, e5) with your pawns. 2. Develop: bring your knights and bishops off the back row, towards the centre. 3. Castle early, to keep your king safe. And two don'ts: don't bring your queen out early, and don't move the same piece twice without a good reason.", marks: ["d4", "e4", "d5", "e5"], fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
      { kind: "move", text: "Make a first move that puts a pawn in the centre.", moves: "", goal: { accept: ["e4", "d4"] }, wrong: { "*": "That doesn't put a pawn on one of the four centre squares. Try a pawn to e4 or d4." }, done: "A pawn in the centre, and lines open for your bishop and queen." },
      { kind: "move", text: "Black copied you. Develop a knight towards the centre.", moves: "e4 e5", goal: { accept: ["Nf3", "Nc3"] }, wrong: { Na3: "A knight on the edge controls fewer squares. Head for the centre.", Nh3: "A knight on the edge controls fewer squares. Head for the centre.", Qh5: "Bringing the queen out early lets Black attack her and develop at the same time.", Qf3: "Bringing the queen out early lets Black attack her and develop at the same time.", "*": "Develop a knight: knights before bishops is a good habit." }, done: "Nf3 also attacks Black's e5 pawn." },
      { kind: "move", text: "Now develop a bishop to an active square.", moves: "e4 e5 Nf3 Nc6", goal: { accept: ["Bc4", "Bb5"] }, wrong: { Be2: "That develops, but the bishop is more active on c4 or b5.", Bd3: "On d3 the bishop blocks your d-pawn. Find a more active square.", "*": "Bring your light-squared bishop out to a square where it does something." }, done: "Developed, and your king can castle next move." },
      { kind: "move", text: "Get your king to safety.", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5", goal: { accept: ["O-O"] }, wrong: { "*": "Your king is still in the middle. Castle kingside!" }, done: "Castled. King safe, rook ready. Now you're playing chess!" },
      { kind: "move", text: "Black played a quiet pawn move. Which move keeps developing instead of moving the same piece twice?", moves: "e4 e5 Nf3 d6", goal: { accept: ["d4", "Nc3", "Bc4", "Bb5+", "Be2"] }, wrong: { Ng5: "Moving the same knight twice wastes time when you have other pieces to develop.", Nxe5: "e5 is defended by the pawn on d6: you'd lose your knight for a pawn.", "*": "Bring out a new piece or claim more of the centre." }, done: "Good: every move brings something new into the game." },
      { kind: "move", text: "Now you're Black. White opened 1.e4. Fight for the centre.", moves: "e4", goal: { accept: ["e5", "d5", "c5", "e6", "c6"] }, wrong: { "*": "Put a pawn in the centre or challenge White's e4 pawn." }, done: "All the main replies to 1.e4 start like this." },
    ],
  },
];

export const basicsById = (id: string) => BASICS.find((b) => b.id === id);
