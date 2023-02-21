import { Input } from "../../common/Input";
import { IProject } from "models";
import { Field } from "../../common/Field";
import { Component, register } from "../../Component";

interface Props {
  project: Partial<IProject | null>;
  onChange: (project: Partial<IProject | null>) => void;
}

@register("x-new-project-form")
export class NewProjectForm extends Component<Props> {
  init() {
    return () => (
      <div>
        <Field label="Name" required>
          <Input
            autoFocus
            fullWidth
            placeholder="Enter project name"
            value={this.props.project?.name}
            onChange={(name) => this.props.onChange({ ...this.props.project, name })}
          />
        </Field>
        <Field label="Description">
          <Input
            fullWidth
            placeholder="Enter a description"
            value={this.props.project?.description}
            onChange={(description) => this.props.onChange({ ...this.props.project, description })}
          />
        </Field>
      </div>
    );
  }
}
