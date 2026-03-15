# K-Means Colors Toy

I want to make an web app that turns any picture into a color pallete and I want to see a cool animation in the process.

## How should look like from user perspective

Before an image is uploaded, show a prompt suggesting to upload an image.

User uploads an image. Only formats natively supported by the browser are accepted (jpg, png, webp, gif, etc.).

We show him the original image, but we resize it so that total number of pixels is below 250K (make it configurable by editing config file).

We show the original image side-by-side with a canvas with same dimentions.

Initially, the pallete has just one color - the average color of the image. All the pixels in the canvas are colored with this color.

User can click on any pixel on the original image. When he clicks, we create a new cluster and assign this pixel to the new cluster. If the animation is currently running, it continues from the current state (no reset).

Then we animate the k-means algorithm by showing each step of k-means. Each iteration should take 100 ms by default (should be configurable by the user). The animation stops when centroids fully converge.

Pixels on the canvas are colored with the average color of the cluster that they **currently** (on the current step) belong to.

Aside from the original image and the canvas there are also the pallete that consists of average colors of each cluster. The palette has no interactive behavior in the first prototype beyond deletion.

User can delete any of the colors in the pallete. In that case the points are assigned to the nearest (by distance, see Algorithm internals) clusters and k-means is re-run. If the animation is currently running, it continues from the current state after reassignment (no reset).

## Algorithm internals

Distance between colors is calculated as a distance between values in the RGB color space.

## Technical details

Project is written in Typescript.

Project should build into 1 static HTML file, 1 JS bundle and 1 CSS bundle. It shouln't need any backend.

No specific preference for bundler (Vite, esbuild, Webpack, Parcel, etc.) or UI framework.

k-means implementation should be clearly seaparated from the rest of the code to make it easier to read and tweak.

distance function should be clearly seaparated from the rest of the code to make it easier to read and tweak.

One iteration of k-means is 1 animation frame, so if k-means generated result faster, we calculate how much do we need to wait and wait, before starting the next iteration. If k-means iteration took longer, we start next iteration immidiately.
