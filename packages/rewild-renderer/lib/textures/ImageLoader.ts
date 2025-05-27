export class ImageLoader {
  images: ImageBitmap[];
  maxWidth: number;
  maxHeight: number;

  constructor() {}

  async loadImages(paths: string[]) {
    const promises = paths.map((src) => {
      return new Promise<ImageBitmap>(function (resolve, reject) {
        const img = document.createElement('img');
        img.crossOrigin = 'Anonymous';
        img.src = src;
        img.onload = () => {
          createImageBitmap(img)
            .then((data) => {
              resolve(data);
            })
            .catch((err) => reject(err));
        };

        img.onerror = (err) => {
          reject(err);
        };
      });
    });

    const images = await Promise.all(promises);
    const { maxHeight, maxWidth } = images.reduce(
      (prev, cur) => {
        prev.maxHeight = Math.max(cur.height, prev.maxHeight);
        prev.maxWidth = Math.max(cur.width, prev.maxWidth);
        return prev;
      },
      { maxHeight: 0, maxWidth: 0 }
    );

    this.maxHeight = maxHeight;
    this.maxWidth = maxWidth;
    this.images = images;
    return this;
  }
}
