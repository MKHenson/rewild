import { Input } from "@rewild/ui/lib/common/Input";
import { IProject } from "models";
import { Field } from "@rewild/ui/lib/common/Field";
import { Component, register } from "@rewild/ui/lib/Component";

interface Props {
  project: Partial<IProject | null>;
  onChange: (project: Partial<IProject | null>) => void;
}

@register("x-new-project-form")
export class NewProjectForm extends Component<Props> {
  init() {
    let project = { ...this.props.project };

    return () => (
      <div>
        <Field label="Name" required>
          <Input
            autoFocus
            fullWidth
            placeholder="Enter project name"
            value={project.name}
            onChange={(value) => {
              project.name = value;
              this.props.onChange(project);
            }}
          />
        </Field>
        <Field label="Description">
          <Input
            fullWidth
            placeholder="Enter a description"
            value={project.description}
            onChange={(value) => {
              project.description = value;
              this.props.onChange(project);
            }}
          />
        </Field>
      </div>
    );
  }
}
