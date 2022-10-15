import { Component } from "solid-js";
import { Input } from "../../common/Input";
import { IProject } from "models";
import { Field } from "../../common/Field";

interface Props {
  project: Partial<IProject | null>;
  onChange: (project: Partial<IProject | null>) => void;
}

export const NewProjectForm: Component<Props> = (props) => {
  return (
    <div>
      <Field label="Name" required>
        <Input
          autoFocus
          placeholder="Enter project name"
          value={props.project?.name}
          onChange={(name) => props.onChange({ ...props.project, name })}
        />
      </Field>
      <Field label="Description">
        <Input
          placeholder="Enter a description"
          value={props.project?.description}
          onChange={(description) => props.onChange({ ...props.project, description })}
        />
      </Field>
    </div>
  );
};
