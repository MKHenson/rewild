import { Renderer } from '../..';
import {
  MsdfChar,
  MsdfTextFormattingOptions,
  MsdfTextMeasurements,
} from '../../../types/interfaces';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { UIElement } from '../../core/UIElement';
import { MsdfFont } from '../../fonts/MsdfFont';

export class UIElementText implements ISharedUniformBuffer {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  requiresUpdate: boolean;
  textMeasurements: MsdfTextMeasurements;

  viewportBuffer: GPUBuffer;
  // uniformValues: Float32Array;
  viewportValues: Float32Array;

  private _text: string;
  private _options: MsdfTextFormattingOptions;
  private _fontSizeInPixels: number = 42;

  constructor(
    group: number,
    text: string = `Hello World. \nThis is a test of MSDF text rendering.\nIsn't it great?`
  ) {
    this.group = group;
    this.requiresBuild = true;
    this.requiresUpdate = true;
    this.text = text;
    this._options = {
      centered: false,
    };

    this.fontSizeInPixels = 14;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }

    if (this.viewportBuffer) {
      this.viewportBuffer.destroy();
    }
  }

  public get text(): string {
    return this._text;
  }

  public set text(value: string) {
    if (this._text !== value) {
      this._text = value;
      this.requiresBuild = true;
    }
  }

  public get fontSizeInPixels(): number {
    return this._fontSizeInPixels;
  }

  public set fontSizeInPixels(value: number) {
    if (this._fontSizeInPixels !== value) {
      this._fontSizeInPixels = value;
      this.requiresBuild = true;
    }
  }

  public get options(): MsdfTextFormattingOptions {
    return this._options;
  }

  public set options(value: MsdfTextFormattingOptions) {
    this._options = value;
    this.requiresBuild = true;
  }

  //  setColor(r: number, g: number, b: number, a: number = 1.0) {
  //   this.bufferArray[16] = r;
  //   this.bufferArray[17] = g;
  //   this.bufferArray[18] = b;
  //   this.bufferArray[19] = a;
  //   this.bufferArrayDirty = true;
  // }

  // setPixelScale(pixelScale: number) {
  //   this.bufferArray[20] = pixelScale;
  //   this.bufferArrayDirty = true;
  // }

  measureText(
    font: MsdfFont,
    text: string,
    charCallback?: (x: number, y: number, line: number, char: MsdfChar) => void
  ): MsdfTextMeasurements {
    let maxWidth = 0;
    const lineWidths: number[] = [];

    let textOffsetX = 0;
    let textOffsetY = 0;
    let line = 0;
    let printedCharCount = 0;
    let nextCharCode = text.charCodeAt(0);
    for (let i = 0; i < text.length; ++i) {
      const charCode = nextCharCode;
      nextCharCode = i < text.length - 1 ? text.charCodeAt(i + 1) : -1;

      switch (charCode) {
        case 10: // Newline
          lineWidths.push(textOffsetX);
          line++;
          maxWidth = Math.max(maxWidth, textOffsetX);
          textOffsetX = 0;
          textOffsetY -= font.lineHeight;
        case 13: // CR
          break;
        case 32: // Space
          // For spaces, advance the offset without actually adding a character.
          textOffsetX += font.getXAdvance(charCode);
          break;
        default: {
          if (charCallback) {
            charCallback(
              textOffsetX,
              textOffsetY,
              line,
              font.getChar(charCode)
            );
          }
          textOffsetX += font.getXAdvance(charCode, nextCharCode);
          printedCharCount++;
        }
      }
    }

    lineWidths.push(textOffsetX);
    maxWidth = Math.max(maxWidth, textOffsetX);

    return {
      width: maxWidth,
      height: lineWidths.length * font.lineHeight,
      lineWidths,
      printedCharCount,
    };
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    const font = renderer.fontManager.get('basic-font');
    const text = this._text;
    const options = this._options || {};

    const uniformBufferSize = 2 * 4;
    this.viewportBuffer = device.createBuffer({
      label: 'viewport uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.viewportValues = new Float32Array(uniformBufferSize / 4);
    this.viewportValues[0] = renderer.canvas.width;
    this.viewportValues[1] = renderer.canvas.height;

    const textBuffer = device.createBuffer({
      label: 'msdf text buffer',
      size: (text.length + 6) * Float32Array.BYTES_PER_ELEMENT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    const textArray = new Float32Array(textBuffer.getMappedRange());
    let offset = 24; // Accounts for the values managed by MsdfText internally.

    // Set the first part of the text array as an identity matrix and default pixel scale
    textArray[0] = 1.0;
    textArray[1] = 0;
    textArray[2] = 0;
    textArray[3] = 0;
    textArray[4] = 0;
    textArray[5] = 1.0;
    textArray[6] = 0;
    textArray[7] = 0;
    textArray[8] = 0;
    textArray[9] = 0;
    textArray[10] = 1.0;
    textArray[11] = 0;
    textArray[12] = 0;
    textArray[13] = 0;
    textArray[14] = 0;
    textArray[15] = 1.0;

    textArray[16] = 1.0;
    textArray[17] = 0;
    textArray[18] = 0;
    textArray[19] = 1;
    textArray[20] = this._fontSizeInPixels / font.size; // Pixel scale

    if (options.centered) {
      this.textMeasurements = this.measureText(font, text);

      // Is this call doing anything?
      this.measureText(
        font,
        text,
        (textX: number, textY: number, line: number, char: MsdfChar) => {
          const lineOffset =
            this.textMeasurements.width * -0.5 -
            (this.textMeasurements.width -
              this.textMeasurements.lineWidths[line]) *
              -0.5;

          textArray[offset] = textX + lineOffset;
          textArray[offset + 1] = textY + this.textMeasurements.height * 0.5;
          textArray[offset + 2] = char.charIndex;
          offset += 4;
        }
      );
    } else {
      this.textMeasurements = this.measureText(
        font,
        text,
        (textX: number, textY: number, line: number, char: MsdfChar) => {
          textArray[offset] = textX;
          textArray[offset + 1] = textY;
          textArray[offset + 2] = char.charIndex;
          offset += 4;
        }
      );
    }

    textBuffer.unmap();

    this.bindGroup = device.createBindGroup({
      label: 'msdf text bind group',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.viewportBuffer },
        },
        {
          binding: 1,
          resource: { buffer: textBuffer },
        },
      ],
    });
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, elements: UIElement[]): void {
    if (
      this.viewportValues[0] !== renderer.canvas.width ||
      this.viewportValues[1] !== renderer.canvas.height
    ) {
      this.requiresUpdate = true;
    }

    if (!this.requiresUpdate) return;

    const { device } = renderer;
    this.requiresUpdate = false;

    this.viewportValues[0] = renderer.canvas.width;
    this.viewportValues[1] = renderer.canvas.height;

    device.queue.writeBuffer(
      this.viewportBuffer,
      0,
      this.viewportValues.buffer,
      0,
      this.viewportValues.byteLength
    );
  }
}
