// import { Mat3 } from "../maths/Mat3";

// /**
//  * Records what objects are colliding with each other
//  * @class ObjectCollisionMatrix
//  * @constructor
//  */
// export class ObjectCollisionMatrix {
//   matrix: Map<string, boolean>;

//   constructor() {
//     /**
//      * The matrix storage
//      * @property matrix
//      * @type {Object}
//      */
//     this.matrix = new Map();
//   }

//   /**
//    * @method get
//    * @param  {Number} i
//    * @param  {Number} j
//    * @return {Number}
//    */
//   get(i, j): string {
//     i = i.id;
//     j = j.id;
//     if (j > i) {
//       const temp = j;
//       j = i;
//       i = temp;
//     }
//     return i + "-" + (j in this.matrix);
//   }

//   /**
//    * @method set
//    * @param  {Number} i
//    * @param  {Number} j
//    * @param {Number} value
//    */
//   set(i, j, value) {
//     i = i.id;
//     j = j.id;
//     if (j > i) {
//       const temp = j;
//       j = i;
//       i = temp;
//     }
//     if (value) {
//       this.matrix.set(i + "-" + j, true);
//     } else {
//       this.matrix.delete(i + "-" + j);
//     }
//   }

//   /**
//    * Empty the matrix
//    * @method reset
//    */
//   reset(): void {
//     this.matrix.clear();
//   }

//   /**
//    * Set max number of objects
//    * @method setNumObjects
//    * @param {Number} n
//    */
//   setNumObjects(n: i32): void {}
// }
