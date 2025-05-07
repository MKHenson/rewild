import { Dispatcher } from './Dispatcher';

type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'rectangle'; width: number; height: number };

describe('Dispatcher', () => {
  it('should dispatch an event to a listener', () => {
    let radius = 0;
    let square = 0;
    let rectangleWidth = 0;
    let rectangleHeight = 0;

    const dispatcher = new Dispatcher<Shape>();
    dispatcher.add((event) => {
      if (event.kind === 'circle') {
        radius = event.radius;
      } else if (event.kind === 'square') {
        square = event.side;
      } else if (event.kind === 'rectangle') {
        rectangleWidth = event.width;
        rectangleHeight = event.height;
      }
    });

    dispatcher.dispatch({ kind: 'circle', radius: 5 });
    expect(radius).toBe(5);

    dispatcher.dispatch({ kind: 'square', side: 10 });
    expect(square).toBe(10);

    dispatcher.dispatch({ kind: 'rectangle', width: 15, height: 20 });
    expect(rectangleWidth).toBe(15);
    expect(rectangleHeight).toBe(20);
  });
});
