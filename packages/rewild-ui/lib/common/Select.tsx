import { MaterialIcon } from "./MaterialIcon";
import { Component, register } from "../Component";
import { theme } from "../theme";

type OptionType = { value: string; label: string };

interface Props {
  value?: string;
  options: OptionType[];
  onChange?: (value: string) => void;
}

@register("x-select")
export class Select extends Component<Props> {
  init() {
    const [showDropDown, setShowDropDown] = this.useState(false);

    const handleShowOptions = () => {
      setShowDropDown(!showDropDown(), false);

      // If showDropDown is true, then add options to the document body
      if (showDropDown()) {
        document.body.appendChild(options);

        setTimeout(
          () => document.body.addEventListener("click", handleElsewhereClicked),
          30
        );
      } else if (options.parentElement) {
        document.body.removeChild(options);
        cleanup();
      }
    };

    // Create event cleanup function
    const cleanup = () => {
      document.body.removeEventListener("click", handleElsewhereClicked);
    };

    const handleElsewhereClicked = (e: MouseEvent) => {
      cleanup();
      if ((e.target as HTMLElement).classList.contains("option")) return;
      setShowDropDown(false);
    };

    const handleOptionClick = (option: OptionType) => {
      this.props.onChange?.(option.value);
      cleanup();
      setShowDropDown(false);
    };

    let options = (
      <Options>
        {this.props.options.map((option) => (
          <Option
            selected={this.props.value === option.value}
            option={option}
            onclick={() => handleOptionClick(option)}
          />
        ))}
      </Options>
    );

    this.onCleanup = () => {
      if (options.parentElement) {
        document.body.removeChild(options);
      }

      cleanup();
    };

    return () => {
      if (!showDropDown() && options.parentElement) {
        document.body.removeChild(options);
      }

      // Position options under this element
      const rect = this.parentElement!.getBoundingClientRect();
      options.style.top = rect.bottom + "px";
      options.style.left = rect.left + "px";
      options.style.width = rect.width + "px";

      return (
        <div class="select" onmouseup={handleShowOptions}>
          <div class="value">
            {
              this.props.options.find((o) => o.value === this.props.value)
                ?.label
            }
          </div>
          <MaterialIcon icon="arrow_drop_down" size="s" />
        </div>
      );
    };
  }

  getStyle() {
    return StyledSelect;
  }
}

@register("x-option")
export class Option extends Component<{
  option: OptionType;
  selected?: boolean;
  onclick?: () => void;
}> {
  init() {
    return () => (
      this.classList.toggle("selected", this.props.selected),
      (
        <div class="option" onclick={this.props.onclick}>
          {this.props.option.label}
        </div>
      )
    );
  }

  getStyle() {
    return StyledOption;
  }
}

@register("x-options")
export class Options extends Component {
  init() {
    this.className = "options";
    return () => <slot />;
  }

  getStyle() {
    return StyledOptions;
  }
}

const StyledOption = cssStylesheet(css`
  :host {
    display: block;
    padding: 0.5rem;
    font-weight: 400;
    background-color: ${theme.colors.surface};
    color: ${theme.colors.onSurface};
  }

  :host(:hover) {
    background-color: ${theme.colors.subtle400};
  }

  :host(.selected) {
    background-color: ${theme.colors.primary400};
    color: ${theme.colors.onPrimary400};
  }

  :host(.selected:hover) {
    background-color: ${theme.colors.primary500};
    color: ${theme.colors.onPrimary500};
  }
`);

const StyledOptions = cssStylesheet(css`
  :host {
    position: absolute;
    display: block;
    border-radius: 5px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid ${theme.colors.onSurfaceBorder};
    box-shadow: ${theme.colors.shadowShort1};
  }
`);

const StyledSelect = cssStylesheet(css`
  :host {
    position: relative;
    display: block;
  }

  .select {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .value {
    padding: 2px;
    font-weight: 400;
  }
`);
