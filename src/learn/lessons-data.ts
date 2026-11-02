// Tactic and checkmate-pattern lessons. Each one is taught from real puzzles carrying the Lichess theme tag.

export type Lesson = { key: string; title: string; what: string; spot: string };

export const TACTICS: Lesson[] = [
  { key: "hangingPiece", title: "Hanging pieces", what: "A piece that is attacked and not defended (or defended too few times) can simply be taken.", spot: "Before every move, ask: what did my opponent's last move leave undefended? What is attacking what?" },
  { key: "fork", title: "Forks", what: "One piece attacks two or more targets at once. The opponent can only save one.", spot: "Knights are the best forkers. Look for squares that hit the king and queen, or two undefended pieces." },
  { key: "pin", title: "Pins", what: "A piece can't move (or shouldn't) because a more valuable piece sits behind it on the same line.", spot: "Line up a bishop, rook or queen with an enemy piece and the king or queen behind it, then pile on the pinned piece." },
  { key: "skewer", title: "Skewers", what: "A reverse pin: the valuable piece is in front, and when it moves the piece behind it falls.", spot: "Check the king or attack the queen along a line where another piece sits behind it." },
  { key: "discoveredAttack", title: "Discovered attacks", what: "Moving one piece uncovers an attack from another piece behind it. Two threats at once.", spot: "When your piece blocks your own bishop, rook or queen, move it with a threat of its own." },
  { key: "doubleCheck", title: "Double check", what: "Two pieces give check at once. The only legal reply is a king move.", spot: "A discovered check where the moving piece also checks. Often leads straight to mate." },
  { key: "deflection", title: "Deflection", what: "Force a defender away from the square or piece it is guarding.", spot: "Find the one piece doing an important job, then attack it or offer it something it must take." },
  { key: "attraction", title: "Attraction (decoy)", what: "Lure a piece, usually the king, onto a bad square, often with a sacrifice.", spot: "Sacrifice on a square next to the king to drag it into a fork, pin or mating net." },
  { key: "capturingDefender", title: "Removing the defender", what: "Capture the piece that protects something, then take what it was protecting.", spot: "Count defenders. If only one piece holds a key square or piece, trade it off or capture it." },
  { key: "intermezzo", title: "In-between moves", what: "Instead of the expected recapture, play a stronger move first (often a check or bigger threat).", spot: "Before recapturing automatically, look for checks and threats that improve your position first." },
  { key: "trappedPiece", title: "Trapped pieces", what: "A piece with no safe squares can be attacked and won.", spot: "Pieces on the edge or deep in enemy territory are often short of squares. Take away their exits." },
  { key: "sacrifice", title: "Sacrifices", what: "Give up material on purpose for a bigger gain: mate, more material, or a winning attack.", spot: "If a sacrifice opens the king or sets up a fork or mate, calculate it fully: checks, captures, threats." },
  { key: "clearance", title: "Clearance", what: "Move a piece off a square or line so another piece can use it.", spot: "When your own piece is in the way of a winning move, move it with tempo." },
  { key: "interference", title: "Interference", what: "Put a piece between an enemy piece and what it defends, cutting the connection.", spot: "Two enemy pieces guarding each other along a line can be split by blocking the line." },
  { key: "xRayAttack", title: "X-ray attacks", what: "A piece attacks or defends through another piece along a line.", spot: "Rooks and queens stacked on a file or rank work through each other after an exchange." },
  { key: "quietMove", title: "Quiet moves", what: "A move that is not a check or capture but creates an unstoppable threat.", spot: "When checks and captures don't work, look for a calm move that leaves the opponent without a good reply." },
  { key: "defensiveMove", title: "Defensive moves", what: "Find the only move that saves the position: defend, block, or counter-threat.", spot: "Work out exactly what your opponent threatens before looking for your own ideas." },
  { key: "advancedPawn", title: "Advanced pawns and promotion", what: "A pawn close to promotion can be worth more than a piece.", spot: "Look for ways to push past blockers, deflect the piece guarding the queening square, or under-promote." },
  { key: "zugzwang", title: "Zugzwang", what: "Any move the opponent makes worsens their position: they would rather pass.", spot: "Common in endgames. Take away waiting moves and make your opponent move."},
];

export const MATES: Lesson[] = [
  { key: "mateIn1", title: "Mate in 1", what: "Find the move that checkmates immediately.", spot: "Look at every check. For each one, can the king escape, can the checker be captured, can the check be blocked?" },
  { key: "mateIn2", title: "Mate in 2", what: "A forcing move (usually a check) that leaves only replies allowing mate next move.", spot: "Try checks first, then captures, then quiet moves that cut off escape squares." },
  { key: "mateIn3", title: "Mate in 3", what: "Three-move combinations, usually all checks.", spot: "Keep the king boxed in: each check should take away squares." },
  { key: "backRankMate", title: "Back-rank mate", what: "A rook or queen mates a king trapped on its back rank by its own pawns.", spot: "If the enemy king has no 'luft' (escape square), check on the back rank. Deflect defenders first." },
  { key: "smotheredMate", title: "Smothered mate", what: "A knight mates a king surrounded by its own pieces.", spot: "Classic idea: Qg8+!! Rxg8, Nf7#. Look when the king is in the corner with pieces around it." },
  { key: "anastasiaMate", title: "Anastasia's mate", what: "A knight and rook (or queen) trap the king on the edge, with its own pawn blocking.", spot: "Knight on e7 covers g8/g6; rook or queen mates on the h-file." },
  { key: "arabianMate", title: "Arabian mate", what: "Rook and knight mate the king in the corner.", spot: "Knight on f6 guards the rook on h7 and covers g8. King on h8, rook mates on h7." },
  { key: "bodenMate", title: "Boden's mate", what: "Two bishops on crossing diagonals mate a king castled queenside.", spot: "Often after a queen sacrifice on c6 rips open the king: the bishops cross on diagonals like a6 and f4." },
  { key: "doubleBishopMate", title: "Double bishop mate", what: "Two bishops on adjacent diagonals mate the king.", spot: "One bishop gives check, the other covers the escape diagonal." },
  { key: "hookMate", title: "Hook mate", what: "Rook, knight and pawn combine: the rook mates, protected by a knight that a pawn protects.", spot: "A knight defended by a pawn guards the rook next to the king." },
  { key: "dovetailMate", title: "Dovetail mate", what: "The queen mates diagonally next to the king while its own pieces block the escape squares.", spot: "Queen adjacent to the king, protected, with the king's own pieces behind it." },
  { key: "epauletteMate", title: "Epaulette mate", what: "The king is blocked on both sides by its own pieces (like shoulder pads), and a queen mates from in front.", spot: "King between two of its own rooks or pieces on the back rank: check from straight ahead." },
  { key: "operaMate", title: "Opera mate", what: "A rook mates on the back rank, protected by a bishop.", spot: "Rook on d8 protected by a bishop on g5 or similar, king blocked by its own pieces." },
  { key: "pillsburysMate", title: "Pillsbury's mate", what: "A rook mates on the g-file or back rank while a bishop on the long diagonal covers escape squares.", spot: "Bishop on b2 aiming at g7/h8 plus a rook on the g-file." },
  { key: "cornerMate", title: "Corner mate", what: "A rook and knight trap the king in the corner.", spot: "Knight covers the escape square, rook delivers mate along the edge." },
  { key: "morphysMate", title: "Morphy's mate", what: "A bishop mates a cornered king while a rook cuts off the escape file.", spot: "King on h8, rook on the g-file, bishop gives check on the long diagonal." },
  { key: "swallowstailMate", title: "Swallow's tail mate", what: "The queen mates face-to-face with the king, protected, while the king's own pieces block its diagonal escape squares.", spot: "Queen right in front of the king with support; look at which squares the king's own pieces take away." },
  { key: "killBoxMate", title: "Kill box mate", what: "Rook and queen together form a box the king can't escape.", spot: "Rook gives check along an edge; the queen diagonally behind covers the rest." },
  { key: "triangleMate", title: "Triangle mate", what: "Queen and rook form a triangle around the king.", spot: "Rook next to the king guarded by the queen, which also covers escape squares." },
  { key: "blindSwineMate", title: "Blind swine mate", what: "Two rooks on the 7th rank mate the king.", spot: "Doubled rooks on the 7th: one gives check, the other covers the escape." },
  { key: "vukovicMate", title: "Vuković mate", what: "A rook mates the king on the edge, protected by its own king or another piece, while a knight covers the escape squares.", spot: "Rook gives check next to the king; the knight takes away the squares the rook can't." },
  { key: "balestraMate", title: "Balestra mate", what: "A bishop gives mate from a distance while the queen covers the escape squares.", spot: "Queen cuts the king off; bishop delivers the final check." },
];

export const lessonByKey = (key: string) => [...TACTICS, ...MATES].find((l) => l.key === key);

// Puzzle rating bands for the five lesson levels.
export const LEVEL_BANDS: [number, number][] = [[0, 1000], [1000, 1300], [1300, 1600], [1600, 1900], [1900, 4000]];
export const LEVEL_UP_STREAK = 5;

export type Endgame = {
  key: string;
  title: string;
  pieces: string; // white pieces besides the king, e.g. "Q", "RR", "BN", "P"
  moveLimit: number; // your moves allowed to mate
  blurb: string;
  steps: string[];
};

export const ENDGAMES: Endgame[] = [
  {
    key: "kq", title: "Queen mate", pieces: "Q", moveLimit: 20,
    blurb: "King and queen against a lone king. The first mate everyone must know.",
    steps: [
      "Use the queen to make a box: put it a knight's move away from the enemy king.",
      "Shrink the box each move, staying a knight's move away. The king is pushed to the edge.",
      "Once the king is on the edge, STOP. Bring your own king up (watch for stalemate!).",
      "Mate with the queen on the edge, protected by your king or next to it.",
    ],
  },
  {
    key: "krr", title: "Two-rook ladder", pieces: "RR", moveLimit: 12,
    blurb: "Two rooks walk the king to the edge without any help from your king.",
    steps: [
      "One rook cuts off a rank (or file); the other gives check on the next rank.",
      "Alternate: the rooks leapfrog each other, pushing the king one rank at a time.",
      "If the king attacks a rook, move that rook far away along its rank, to the other side.",
      "Mate when the king reaches the edge.",
    ],
  },
  {
    key: "kr", title: "Rook mate", pieces: "R", moveLimit: 30,
    blurb: "King and rook against king. Needs teamwork between king and rook.",
    steps: [
      "Cut the enemy king off with your rook along a rank or file.",
      "Bring your king towards it. Kings face each other with one square between (opposition).",
      "When the kings are in opposition, check with the rook: the king is pushed back a rank.",
      "If not in opposition, make a waiting rook move along the cut-off line, or shrink the box.",
      "Repeat until the king is on the edge, then check there: mate.",
    ],
  },
  {
    key: "kbb", title: "Two bishops mate", pieces: "BB", moveLimit: 35,
    blurb: "Two bishops side by side form a wall the king can't cross.",
    steps: [
      "Put the bishops next to each other in the centre: they block a diagonal wall.",
      "Bring your king up to support them.",
      "Push the king towards a corner (any corner works).",
      "Mate in the corner: one bishop checks, the other covers the escape diagonal. Avoid stalemate.",
    ],
  },
  {
    key: "kbn", title: "Bishop and knight mate", pieces: "BN", moveLimit: 50,
    blurb: "The hardest basic mate. You can only mate in a corner the bishop's colour.",
    steps: [
      "Drive the king to the edge using all three pieces together.",
      "Mate only works in a corner the same colour as your bishop.",
      "If the king runs to the wrong corner, use the 'W manoeuvre' with the knight to push it along the edge.",
      "King, bishop and knight together cover the escape squares for the final check.",
    ],
  },
  {
    key: "kp", title: "King and pawn", pieces: "P", moveLimit: 45,
    blurb: "Escort the pawn to promotion against the lone king, then mate.",
    steps: [
      "Your king leads the pawn, not the other way round. Get it in front of the pawn.",
      "Use the opposition: kings facing with one square between, opponent to move, and you gain ground.",
      "A rook's pawn (a or h file) is often a draw if the defending king reaches the corner.",
      "After promoting, finish with the queen mate.",
    ],
  },
];

export const endgameByKey = (key: string) => ENDGAMES.find((e) => e.key === key);
