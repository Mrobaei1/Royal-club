# Iranian Manch — Visual Specification

## Product identity
A recognizable Iranian four-colour Manch board, not a reskinned generic foreign Ludo screen. Royal Club styling is applied around the classic board without changing its visual grammar.

## Board anatomy
- Square board with four distinct home yards: red, green, yellow, blue.
- Four tokens begin in each player's yard.
- Shared cross-shaped route around the central area.
- One colour-specific home lane per player leading into the centre.
- Four-colour centre/finish area.
- Safe-cell markers and clear entry-cell markers.
- Stable seat mapping independent of Persian RTL text direction.

## Royal Club treatment
- Outer frame: deep navy `#111B31`.
- Trim and active-player emphasis: gold `#D8B45A`.
- Route: warm ivory `#F7F1E5`.
- Seats: red `#D94747`, green `#239B69`, yellow `#F0C642`, blue `#397BD4`.
- Tokens should be high-contrast and touch targets should be at least 44 logical pixels in the interactive layer.

## Responsive behaviour
- Board maintains a 1:1 aspect ratio.
- Board geometry never mirrors in RTL.
- Player identity, avatar, dice controls, turn timer, and action buttons remain outside the painter.
- Portrait: player panels stack above/below board; landscape may place panels at the sides.
- Do not place critical text inside small route cells.

## Architecture boundary
The board is a pure renderer. Dice generation, move legality, capture, safe-cell logic, turn progression, winner detection, persistence and networking belong to separate layers.

## Acceptance checks
- All four home yards and all four home lanes are visible.
- Four-colour centre is centred and symmetrical.
- Board remains square at narrow and wide constraints.
- RTL and LTR produce identical board geometry.
- Active seat emphasis does not obscure token colour.
- Theme changes around the board do not erase the four fixed player colours.

## Not yet frozen
Exact Iranian safe-cell locations, exact route-cell sequence, starting positions, and all local rule variants require owner confirmation before engine implementation.
