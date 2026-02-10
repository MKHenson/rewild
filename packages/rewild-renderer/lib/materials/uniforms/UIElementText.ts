import { Renderer } from '../..';
import {
  MsdfChar,
  MsdfTextFormattingOptions,
  MsdfTextMeasurements,
} from '../../../types/interfaces';
import { Camera } from '../../core/Camera';
import { Transform } from '../../core/Transform';
import { UIElement } from '../../core/UIElement';
import { MsdfFont } from '../../fonts/MsdfFont';

export class UIElementText {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  requiresUpdate: boolean;
  textMeasurements: MsdfTextMeasurements;

  viewportBuffer: GPUBuffer;
  viewportValues: Float32Array;

  textPropertiesBuffer: GPUBuffer;
  textPropertiesValues: Float32Array;

  private _text: string;
  private _options: MsdfTextFormattingOptions;
  private _lastMaxWidth: number;

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
      justify: false,
      color: [1, 1, 1, 1],
      fontSize: 12,
      wordWrap: true,
    };
  }

  public get text(): string {
    return this._text;
  }

  public set text(value: string) {
    this._text = value;
    this.requiresBuild = true;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }

    if (this.viewportBuffer) {
      this.viewportBuffer.destroy();
    }

    if (this.textPropertiesBuffer) {
      this.textPropertiesBuffer.destroy();
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
    widthLimit: number,
    wordWrap: boolean,
    existingMeasurements?: MsdfTextMeasurements | null, // Use explicit null if needed or optional
    charCallback?: (x: number, y: number, line: number, char: MsdfChar) => void
  ): MsdfTextMeasurements {
    let maxWidth = 0;
    const lineWidths: number[] = [];
    const spacesPerLine: number[] = [];
    let spacesInCurrentLine = 0;

    let textOffsetX = 0;

    // When justifying, we need a separate cursor for the visual position (with gaps)
    // vs the logical position (for wrapping calculations).
    let renderOffsetX = 0;
    let textOffsetY = 0;
    let line = 0;
    let printedCharCount = 0;
    let nextCharCode = text.charCodeAt(0);
    let lastWasWhitespace = true;

    const getWordWidth = (startIndex: number): number => {
      let width = 0;
      let curr = startIndex;
      while (curr < text.length) {
        const c = text.charCodeAt(curr);
        if (c === 32 || c === 10 || c === 13) break;
        const n = curr < text.length - 1 ? text.charCodeAt(curr + 1) : -1;
        width += font.getXAdvance(c, n);
        curr++;
      }
      return width;
    };

    for (let i = 0; i < text.length; ++i) {
      const charCode = nextCharCode;
      nextCharCode = i < text.length - 1 ? text.charCodeAt(i + 1) : -1;

      switch (charCode) {
        case 10: // Newline
          lineWidths.push(textOffsetX);
          spacesPerLine.push(spacesInCurrentLine);
          line++;
          maxWidth = Math.max(maxWidth, textOffsetX);
          textOffsetX = 0;
          renderOffsetX = 0;
          spacesInCurrentLine = 0;
          textOffsetY -= font.lineHeight;
          lastWasWhitespace = true;
          break;
        case 13: // CR
          lastWasWhitespace = true;
          break;
        case 32: // Space
          // For spaces, advance the offset without actually adding a character.
          {
            const advance = font.getXAdvance(charCode);
            textOffsetX += advance;

            let extraSpacing = 0;
            if (
              existingMeasurements &&
              existingMeasurements.spacesPerLine[line] > 0 &&
              line < existingMeasurements.lineWidths.length - 1
            ) {
              const totalSpaces = existingMeasurements.spacesPerLine[line];
              const lineW = existingMeasurements.lineWidths[line];
              if (widthLimit > lineW) {
                extraSpacing = (widthLimit - lineW) / totalSpaces;
              }
            }
            renderOffsetX += advance + extraSpacing;

            spacesInCurrentLine++;
            lastWasWhitespace = true;
          }
          break;
        default: {
          if (wordWrap && lastWasWhitespace) {
            const wordWidth = getWordWidth(i);
            if (textOffsetX > 0 && textOffsetX + wordWidth > widthLimit) {
              lineWidths.push(textOffsetX);
              spacesPerLine.push(spacesInCurrentLine);
              line++;
              maxWidth = Math.max(maxWidth, textOffsetX);
              textOffsetX = 0;
              renderOffsetX = 0;
              spacesInCurrentLine = 0;
              textOffsetY -= font.lineHeight;
            }
          }
          lastWasWhitespace = false;

          if (charCallback) {
            charCallback(
              renderOffsetX,
              textOffsetY,
              line,
              font.getChar(charCode)
            );
          }
          const advancedAmount = font.getXAdvance(charCode, nextCharCode);

          if (textOffsetX + advancedAmount <= widthLimit) {
            textOffsetX += advancedAmount;
            renderOffsetX += advancedAmount;
            printedCharCount++;
          } else {
            // Exceeded width limit, move to next line.
            lineWidths.push(textOffsetX);
            spacesPerLine.push(spacesInCurrentLine);
            line++;
            maxWidth = Math.max(maxWidth, textOffsetX);
            textOffsetX = 0;
            renderOffsetX = 0;
            spacesInCurrentLine = 0;
            textOffsetY -= font.lineHeight;
            printedCharCount++;
          }
        }
      }
    }

    lineWidths.push(textOffsetX);
    spacesPerLine.push(spacesInCurrentLine);
    maxWidth = Math.max(maxWidth, textOffsetX);

    return {
      width: maxWidth,
      height: lineWidths.length * font.lineHeight,
      lineWidths,
      spacesPerLine,
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
      size: text.length * Float32Array.BYTES_PER_ELEMENT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    const textArray = new Float32Array(textBuffer.getMappedRange());
    let offset = 0; // Accounts for the values managed by MsdfText internally.
    const maxWidth = this._lastMaxWidth || 100;
    const widthLimit = maxWidth / (this._options.fontSize! / font.size);

    const wordWrap = this._options.wordWrap || false;

    if (options.centered) {
      this.textMeasurements = this.measureText(
        font,
        text,
        widthLimit,
        wordWrap,
        null
      );

      this.measureText(
        font,
        text,
        widthLimit,
        wordWrap,
        options.justify ? this.textMeasurements : null,
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
        widthLimit,
        wordWrap,
        null
      );

      this.measureText(
        font,
        text,
        widthLimit,
        wordWrap,
        options.justify ? this.textMeasurements : null,
        (textX: number, textY: number, line: number, char: MsdfChar) => {
          textArray[offset] = textX;
          textArray[offset + 1] = textY;
          textArray[offset + 2] = char.charIndex;
          offset += 4;
        }
      );
    }

    textBuffer.unmap();

    const textPropertiesBufferSize = 8 * Float32Array.BYTES_PER_ELEMENT;
    this.textPropertiesBuffer = device.createBuffer({
      label: 'msdf text properties',
      size: textPropertiesBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.textPropertiesValues = new Float32Array(8);
    // x, y will be set dynamically in prepare() from the UIElement
    this.textPropertiesValues[0] = 0;
    this.textPropertiesValues[1] = 0;
    this.textPropertiesValues[2] = this._options.fontSize! / font.size;
    this.textPropertiesValues[3] = 0.0;
    this.textPropertiesValues[4] = options.color ? options.color[0] : 1.0;
    this.textPropertiesValues[5] = options.color ? options.color[1] : 1.0;
    this.textPropertiesValues[6] = options.color ? options.color[2] : 1.0;
    this.textPropertiesValues[7] = options.color ? options.color[3] : 1.0;

    // Write the initial static properties (fontSize, color) to the buffer.
    // x/y (indices 0,1) will be written in prepare() from the UIElement.
    device.queue.writeBuffer(
      this.textPropertiesBuffer,
      0,
      this.textPropertiesValues.buffer,
      0,
      this.textPropertiesValues.byteLength
    );

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
        {
          binding: 2,
          resource: { buffer: this.textPropertiesBuffer },
        },
      ],
    });
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, transform: Transform): void {
    const element = transform.component as UIElement;
    if (!element) return;

    const { device } = renderer;

    // Check if viewport size changed
    if (
      this.viewportValues[0] !== renderer.canvas.width ||
      this.viewportValues[1] !== renderer.canvas.height
    ) {
      this.requiresUpdate = true;
    }

    // Check if element width changed (used as maxWidth for text wrapping)
    const elementWidth = element.getWidth(renderer);
    if (this._lastMaxWidth !== elementWidth) {
      this._lastMaxWidth = elementWidth;
      this.requiresBuild = true;
    }

    // Check if element position changed (position is externally driven,
    // so we must check every frame)
    const elementX = element.getX(renderer);
    const elementY = element.getY(renderer);

    if (
      this.textPropertiesValues[0] !== elementX ||
      this.textPropertiesValues[1] !== elementY
    ) {
      this.textPropertiesValues[0] = elementX;
      this.textPropertiesValues[1] = elementY;
      this.requiresUpdate = true;
    }

    if (!this.requiresUpdate) return;
    this.requiresUpdate = false;

    // Write viewport
    this.viewportValues[0] = renderer.canvas.width;
    this.viewportValues[1] = renderer.canvas.height;
    device.queue.writeBuffer(
      this.viewportBuffer,
      0,
      this.viewportValues.buffer,
      0,
      this.viewportValues.byteLength
    );

    // Write text properties (position, fontSize, color)
    device.queue.writeBuffer(
      this.textPropertiesBuffer,
      0,
      this.textPropertiesValues.buffer,
      0,
      this.textPropertiesValues.byteLength
    );
  }
}
