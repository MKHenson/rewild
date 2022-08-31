import { _Math } from "../../../math/Math";
import { SAPElement } from "./SAPElement";

/**
 * A projection axis for sweep and prune broad-phase.
 * @author saharan
 */

export class SAPAxis {
  numElements: i32;
  bufferSize: i32;
  elements: (SAPElement | null)[];
  stack: Float32Array;

  constructor() {
    this.numElements = 0;
    this.bufferSize = 256;
    this.elements = [];
    this.elements.length = this.bufferSize;
    this.stack = new Float32Array(64);
  }

  addElements(min: SAPElement, max: SAPElement): void {
    if (this.numElements + 2 >= this.bufferSize) {
      //this.bufferSize<<=1;
      this.bufferSize *= 2;
      const newElements = [];
      let i: i32 = this.numElements;
      while (i--) {
        //for(let i: i32=0, l=this.numElements; i<l; i++){
        newElements[i] = this.elements[i];
      }
    }
    this.elements[this.numElements++] = min;
    this.elements[this.numElements++] = max;
  }

  removeElements(min: SAPElement, max: SAPElement): void {
    let minIndex: i32 = -1;
    let maxIndex: i32 = -1;
    for (let i: i32 = 0, l = this.numElements; i < l; i++) {
      const e = this.elements[i];
      if (e == min || e == max) {
        if (minIndex == -1) {
          minIndex = i;
        } else {
          maxIndex = i;
          break;
        }
      }
    }
    for (let i = minIndex + 1, l = maxIndex; i < l; i++) {
      this.elements[i - 1] = this.elements[i];
    }
    for (let i = maxIndex + 1, l = this.numElements; i < l; i++) {
      this.elements[i - 2] = this.elements[i];
    }

    this.elements[--this.numElements] = null;
    this.elements[--this.numElements] = null;
  }

  sort(): void {
    let count: i32 = 0;
    let threshold: i32 = 1;
    while (this.numElements >> threshold != 0) threshold++;
    threshold = (threshold * this.numElements) >> 2;
    count = 0;

    let giveup = false;
    const elements = this.elements;

    for (let i: i32 = 1, l = this.numElements; i < l; i++) {
      // try insertion sort
      const tmp = elements[i]!;
      const pivot = tmp.value;
      let tmp2 = elements[i - 1]!;
      if (tmp2.value > pivot) {
        let j = i;
        do {
          elements[j] = tmp2;
          if (--j == 0) break;
          tmp2 = elements[j - 1]!;
        } while (tmp2.value > pivot);
        elements[j] = tmp;
        count += i - j;
        if (count > threshold) {
          giveup = true; // stop and use quick sort
          break;
        }
      }
    }
    if (!giveup) return;
    count = 2;
    const stack = this.stack;
    stack[0] = 0;
    stack[1] = this.numElements - 1;
    while (count > 0) {
      const right = stack[--count];
      const left = stack[--count];
      const diff = right - left;
      let tmp: SAPElement, tmp2: SAPElement;
      let pivot: f32, i: f32, j: f32;

      if (diff > 16) {
        // quick sort
        //const mid=left+(diff>>1);
        const mid = left + Mathf.floor(diff * 0.5);
        tmp = elements[mid]!;
        elements[mid] = elements[right];
        elements[right] = tmp;
        pivot = tmp.value;
        i = left - 1;
        j = right;
        while (true) {
          let ei: SAPElement;
          let ej: SAPElement;
          do {
            ei = elements[++i]!;
          } while (ei.value < pivot);
          do {
            ej = elements[--j]!;
          } while (pivot < ej.value && j != left);
          if (i >= j) break;
          elements[i] = ej;
          elements[j] = ei;
        }

        elements[right] = elements[i];
        elements[i] = tmp;
        if (i - left > right - i) {
          stack[count++] = left;
          stack[count++] = i - 1;
          stack[count++] = i + 1;
          stack[count++] = right;
        } else {
          stack[count++] = i + 1;
          stack[count++] = right;
          stack[count++] = left;
          stack[count++] = i - 1;
        }
      } else {
        for (i = left + 1; i <= right; i++) {
          tmp = elements[i]!;
          pivot = tmp.value;
          tmp2 = elements[i - 1]!;
          if (tmp2.value > pivot) {
            j = i;
            do {
              elements[j] = tmp2;
              if (--j == 0) break;
              tmp2 = elements[j - 1]!;
            } while (tmp2.value > pivot);
            elements[j] = tmp;
          }
        }
      }
    }
  }

  calculateTestCount(): f32 {
    let num: i32 = 1;
    let sum: i32 = 0;
    for (let i: i32 = 1, l: i32 = this.numElements; i < l; i++) {
      if (this.elements[i]!.max) {
        num--;
      } else {
        sum += num;
        num++;
      }
    }
    return sum;
  }
}
