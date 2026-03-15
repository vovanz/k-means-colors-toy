## Responsive web design

Web page needs to adapt to screen size.

All elements should fit on the screen without scrolling if possible (scrolling is acceptable only on very small screens).

### Image/canvas layout

The original image and the canvas should be arranged either side-by-side or stacked vertically — whichever wastes less space — based on the image's aspect ratio and the screen's aspect ratio/orientation. Both the image and the canvas should scale up or down to fill the available space.

This should be done with pure CSS if possible, with minimal JavaScript only where CSS alone cannot express the logic.

### Palette and controls

The palette and speed control should adapt their position together with the image/canvas layout — they should not always be pinned below.

### Upload area

When first visiting the page the upload area should be large (good for discoverability). Once an image is loaded it should shrink to a small button so it stays accessible (for swapping the image) without consuming screen space.
