import 'package:flutter/material.dart';

const Map<String, String> _pieces = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟︎',
};

class ChessBoard extends StatefulWidget {
  const ChessBoard({
    super.key,
    required this.fen,
    required this.legalMoves,
    required this.onMove,
    this.interactive = true,
  });

  final String fen;
  /// UCI moves supplied by the authoritative server (promotion suffix included).
  final List<String> legalMoves;
  final ValueChanged<String> onMove;
  final bool interactive;

  @override
  State<ChessBoard> createState() => _ChessBoardState();
}

class _ChessBoardState extends State<ChessBoard> {
  String? _selected;

  List<String> _readBoard() {
    final fields = widget.fen.trim().split(RegExp(r'\s+'));
    if (fields.isEmpty) return List.filled(64, '');
    final ranks = fields.first.split('/');
    if (ranks.length != 8) return List.filled(64, '');
    final squares = <String>[];
    for (final rank in ranks) {
      for (final token in rank.split('')) {
        final empty = int.tryParse(token);
        if (empty != null && empty >= 1 && empty <= 8) {
          squares.addAll(List.filled(empty, ''));
        } else if (_pieces.containsKey(token)) {
          squares.add(token);
        } else {
          return List.filled(64, '');
        }
      }
    }
    return squares.length == 64 ? squares : List.filled(64, '');
  }

  String _square(int row, int col) => '${'abcdefgh'[col]}${8 - row}';

  Future<void> _tap(int row, int col) async {
    if (!widget.interactive) return;
    final square = _square(row, col);
    final selected = _selected;
    if (selected == null) {
      final canMove = widget.legalMoves.any((move) => move.startsWith(square));
      if (canMove) setState(() => _selected = square);
      return;
    }
    if (selected == square) {
      setState(() => _selected = null);
      return;
    }
    final candidates = widget.legalMoves
        .where((move) => move.startsWith(selected) && move.substring(2, 4) == square)
        .toList();
    if (candidates.isEmpty) {
      final canMove = widget.legalMoves.any((move) => move.startsWith(square));
      setState(() => _selected = canMove ? square : null);
      return;
    }
    setState(() => _selected = null);
    if (candidates.length == 1) {
      widget.onMove(candidates.single);
      return;
    }
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    final promotion = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(fa ? 'انتخاب مهرهٔ ارتقا' : 'Choose promotion'),
        content: Wrap(
          spacing: 8,
          children: [
            for (final entry in const [('q', fa ? 'وزیر' : 'Queen'), ('r', fa ? 'رخ' : 'Rook'), ('b', fa ? 'فیل' : 'Bishop'), ('n', fa ? 'اسب' : 'Knight')])
              TextButton(
                onPressed: () => Navigator.pop(context, entry.$1),
                child: Text(entry.$2),
              ),
          ],
        ),
      ),
    );
    if (promotion != null && mounted) {
      final move = candidates.firstWhere(
        (candidate) => candidate.endsWith(promotion),
        orElse: () => '',
      );
      if (move.isNotEmpty) widget.onMove(move);
    }
  }

  @override
  Widget build(BuildContext context) {
    final board = _readBoard();
    final targets = _selected == null
        ? <String>{}
        : widget.legalMoves
            .where((move) => move.startsWith(_selected!))
            .map((move) => move.substring(2, 4))
            .toSet();
    return AspectRatio(
      aspectRatio: 1,
      child: Directionality(
        // Chess coordinates and board orientation remain canonical in RTL locales.
        textDirection: TextDirection.ltr,
        child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        itemCount: 64,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 8),
        itemBuilder: (context, index) {
          final row = index ~/ 8;
          final col = index % 8;
          final square = _square(row, col);
          final piece = board[index];
          final dark = (row + col).isOdd;
          final selected = square == _selected;
          final target = targets.contains(square);
          return Semantics(
            label: '$square ${piece.isEmpty ? 'empty' : _pieces[piece]}',
            button: widget.interactive,
            child: GestureDetector(
              onTap: () => _tap(row, col),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: selected
                      ? const Color(0xFFE8C547)
                      : dark
                          ? const Color(0xFF769656)
                          : const Color(0xFFEEEED2),
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    if (target)
                      Container(
                        width: piece.isEmpty ? 14 : 48,
                        height: piece.isEmpty ? 14 : 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: piece.isEmpty ? null : Border.all(color: const Color(0xFF315B32), width: 4),
                          color: piece.isEmpty ? const Color(0x88315B32) : Colors.transparent,
                        ),
                      ),
                    if (piece.isNotEmpty)
                      Text(
                        _pieces[piece]!,
                        style: TextStyle(
                          fontSize: 38,
                          color: piece.toLowerCase() == piece ? const Color(0xFF171717) : const Color(0xFFFFFEF4),
                          shadows: const [Shadow(color: Colors.black54, blurRadius: 2)],
                        ),
                      ),
                    if (col == 0)
                      Positioned(top: 1, left: 3, child: Text('${8 - row}', style: const TextStyle(fontSize: 9))),
                    if (row == 7)
                      Positioned(bottom: 1, right: 3, child: Text('abcdefgh'[col], style: const TextStyle(fontSize: 9))),
                  ],
                ),
              ),
            ),
          );
        },
      ),
      ),
    );
  }
}
