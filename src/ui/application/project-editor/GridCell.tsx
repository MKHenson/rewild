import { EditorType } from 'models';
import { IGridCellAction } from 'rewild-ui';
import {
  startDragDrop,
  compelteDragDrop,
  curDragAction,
  Component,
  register,
} from 'rewild-ui';

type CellUpdatedCallback = (
  type: EditorType,
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
  interaction: 'drop' | 'button'
) => void;

interface Props {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  hasElement?: boolean;
  editorElm?: JSX.Element;
  editor?: EditorType;
  onEditorMoved: CellUpdatedCallback;
}

const onDragEndEvent = (e: DragEvent) => {
  e.preventDefault();
};

@register('x-grid-cell')
export class GridCell extends Component<Props> {
  init() {
    const onDragStart = (e: DragEvent) => {
      const props = this.props;

      startDragDrop<IGridCellAction>(e, {
        type: 'cell-move',
        editor: props.editor!,
        sizeX: props.colEnd - props.colStart,
        sizeY: props.rowEnd - props.rowStart,
      });
    };

    const onClickLeftShrink = (e: MouseEvent) => {
      const props = this.props;
      props.onEditorMoved(
        props.editor!,
        props.rowStart,
        props.colStart + 1,
        props.rowEnd,
        props.colEnd,
        'button'
      );
    };

    const onClickLeftExpand = (e: MouseEvent) => {
      const props = this.props;
      props.onEditorMoved(
        props.editor!,
        props.rowStart,
        props.colStart - 1,
        props.rowEnd,
        props.colEnd,
        'button'
      );
    };

    const onClickRightShrink = (e: MouseEvent) => {
      const props = this.props;
      props.onEditorMoved(
        props.editor!,
        props.rowStart,
        props.colStart,
        props.rowEnd,
        props.colEnd - 1,
        'button'
      );
    };

    const onClickRightExpand = (e: MouseEvent) => {
      const props = this.props;
      props.onEditorMoved(
        props.editor!,
        props.rowStart,
        props.colStart,
        props.rowEnd,
        props.colEnd + 1,
        'button'
      );
    };

    const onClickHeightShrink = (e: MouseEvent) => {
      const props = this.props;
      props.onEditorMoved(
        props.editor!,
        props.rowStart,
        props.colStart,
        props.rowEnd - 1,
        props.colEnd,
        'button'
      );
    };

    const onClickHeightExpand = (e: MouseEvent) => {
      const props = this.props;
      props.onEditorMoved(
        props.editor!,
        props.rowStart,
        props.colStart,
        props.rowEnd + 1,
        props.colEnd,
        'button'
      );
    };

    this.ondragover = onDragOverEvent;
    this.ondragleave = onDragLeaveEvent;
    this.ondragend = onDragEndEvent;
    this.ondrop = onDrop;

    const gridElement = (
      <div>
        <div class="content">
          <span class="editor-placeholder" />
          <div class="dragger" draggable={true} ondragstart={onDragStart} />
          <div class="sizer sizerLeft_shrink" onclick={onClickLeftShrink}>
            -
          </div>
          <div class="sizer sizerLeft_expand" onclick={onClickLeftExpand}>
            +
          </div>
          <div class="sizer sizerRight_shrink" onclick={onClickRightShrink}>
            -
          </div>
          <div class="sizer sizerRight_expand" onclick={onClickRightExpand}>
            +
          </div>
          <div class="sizer sizerHeight_shrink" onclick={onClickHeightShrink}>
            -
          </div>
          <div class="sizer sizerHeight_expand" onclick={onClickHeightExpand}>
            +
          </div>
        </div>
      </div>
    );

    return () => {
      const props = this.props;

      this.setGridArea(
        props.rowStart,
        props.colStart,
        props.rowEnd,
        props.colEnd
      );
      this.setEditor(
        props.editorElm,
        gridElement.querySelector('.editor-placeholder') as HTMLElement
      );

      return gridElement;
    };
  }

  setGridArea(
    rowStart: number,
    colStart: number,
    rowEnd: number,
    colEnd: number
  ) {
    this.style.gridArea = `${rowStart} / ${colStart} / ${rowEnd} / ${colEnd}`;
    this._props.rowStart = rowStart;
    this._props.colStart = colStart;
    this._props.rowEnd = rowEnd;
    this._props.colEnd = colEnd;

    if (colEnd - colStart === 1) this.setAttribute('data-is-one-col', 'true');
    else this.removeAttribute('data-is-one-col');

    if (rowEnd - rowStart === 1) this.setAttribute('data-is-one-row', 'true');
    else this.removeAttribute('data-is-one-row');
  }

  setEditor(editor?: JSX.Element | null, parent?: HTMLElement | null) {
    this.setAttribute('data-has-element', editor ? 'true' : 'false');

    const placeholder =
      parent || this.shadowRoot!.querySelector('.editor-placeholder');
    if (!placeholder) return;

    // Remove all children inside the placeholder and replace with editor
    while (placeholder.firstChild) {
      placeholder.removeChild(placeholder.firstChild);
    }

    if (editor) {
      placeholder.appendChild(editor);
      this._props.editorElm = editor;
    }
  }

  getStyle() {
    return StyledGridCell;
  }
}

/** Allow drop */
const onDragOverEvent = (e: DragEvent) => {
  if (!curDragAction || curDragAction.type !== 'cell-move') return;

  (e.currentTarget as HTMLDivElement).setAttribute('drop-active', 'true');
  e.preventDefault();
};

const onDragLeaveEvent = (e: DragEvent) => {
  (e.currentTarget as HTMLDivElement).setAttribute('drop-active', '');
  e.preventDefault();
};

const onDrop = (e: DragEvent) => {
  const props = (e.currentTarget as GridCell).props;
  (e.currentTarget as HTMLDivElement).setAttribute('drop-active', '');
  const json = compelteDragDrop<IGridCellAction>(e);
  if (!json) return;

  const rowEnd = props.rowStart + json.sizeY;
  const colEnd = props.colStart + json.sizeX;

  props.onEditorMoved(
    json.editor as EditorType,
    props.rowStart,
    props.colStart,
    rowEnd < props.rowEnd ? props.rowEnd : rowEnd,
    colEnd < props.colEnd ? props.colEnd : colEnd,
    'drop'
  );
};

const StyledGridCell = cssStylesheet(css`
  :host,
  :host > div {
    height: 100%;
    width: 100%;
    background: transparent;
  }

  :host {
    min-height: 0;
    min-width: 0;
  }

  .content {
    height: 100%;
    width: 100%;
    overflow: auto;
    padding: 0 5px 5px 5px;
    box-sizing: border-box;
    position: relative;
  }
  :host([data-is-one-col='true']) .sizerRight_shrink,
  :host([data-is-one-col='true']) .sizerLeft_shrink {
    display: none;
  }
  :host([data-is-one-row='true']) .sizerHeight_shrink {
    display: none;
  }

  :host([drop-active='true']) {
    background: #1e5ebf7f;
  }
  :host([data-has-element='false']) .content {
    display: none;
  }
  .sizer {
    transition: 0.3s width, 0.3s height, 0.3s opacity;
    position: absolute;
    width: 0px;
    height: 0px;
    background: transparent;
    cursor: pointer;
    overflow: hidden;
    color: #fff;
    font-size: 12px;
    text-align: center;
    line-height: 12px;
    border-radius: 50%;
    opacity: 0;
    transform: scale(1);
  }
  .sizer:active {
    transform: scale(0.8);
  }
  .sizerLeft_shrink {
    left: -0;
    top: calc(50% - 8px);
  }
  .sizerLeft_expand {
    left: -0;
    top: calc(50% + 8px);
  }
  .sizerRight_shrink {
    right: -0;
    top: calc(50% - 8px);
  }
  .sizerRight_expand {
    right: -0;
    top: calc(50% + 8px);
  }
  .sizerHeight_shrink {
    right: calc(50% + 8px);
    bottom: -0;
  }
  .sizerHeight_expand {
    right: calc(50% - 8px);
    bottom: -0;
  }
  .content:hover .sizer {
    background: transparent;
    background: #3b5db4;
    width: 12px;
    height: 12px;
    opacity: 1;
  }
  .content:hover .sizer:hover {
    background: #213464;
  }
  .dragger {
    position: absolute;
    top: 0;
    left: 5px;
    width: calc(100% - 10px);
    height: 5px;
    background: transparent;
    cursor: move;
    border-radius: 5px 5px 0 0;
  }
  .content:hover .dragger {
    background: #3b5db4;
  }
  .content:hover .dragger:hover {
    background: #213464;
  }
  .card {
    width: 100%;
    height: 100%;
  }
`);
