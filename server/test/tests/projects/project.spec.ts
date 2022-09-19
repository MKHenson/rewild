import * as assert from "assert";
import { header } from "../../utils/header";
import {
  ADD_PROJECT,
  PATCH_PROJECT,
  REMOVE_PROJECT,
} from "./project.mutations";
import { GET_PROJECTS } from "./project.queries";
import {
  Project,
  PaginatedProjectResponse,
  AddProjectInput,
  UpdateProjectInput,
} from "../../../models";
import { randomString } from "../../utils/randString";

describe("Testing project API", function () {
  let project: Project;

  it("can create a new project", async function () {
    const name = `test_${randomString()}`;
    const resp = await header.guest.graphql<
      { project: Project },
      { project: AddProjectInput }
    >(ADD_PROJECT, { project: { name } });
    project = resp.data.project;
    assert.ok(project.id);
    assert.deepEqual(project.name, name);
    assert.ok(project.created);
    assert.ok(project.lastUpdated);
  });

  it("fetches the created project", async function () {
    const resp = await header.guest.graphql<{
      projects: PaginatedProjectResponse;
    }>(GET_PROJECTS);
    const projects = resp.data.projects;
    assert.ok(projects.count >= 1);
    assert.ok(projects.data.find((p) => p.id === project.id));
  });

  it("can update a project", async function () {
    const name = `test_${randomString()}`;
    const resp = await header.guest.graphql<
      { project: Project },
      { project: UpdateProjectInput }
    >(PATCH_PROJECT, { project: { id: project.id, name } });

    project = resp.data.project;
    assert.ok(project.id);
    assert.deepEqual(project.name, name);
  });

  it("throws an error deleting a project that doesnt exist", async function () {
    const resp = await header.guest.graphql<
      { removeProject: boolean },
      { id: string }
    >(REMOVE_PROJECT, { id: "-1" });

    assert.deepEqual(resp.data.removeProject, false);
  });

  it("delete a project", async function () {
    const resp = await header.guest.graphql<
      { removeProject: boolean },
      { id: string }
    >(REMOVE_PROJECT, { id: project.id });

    assert.ok(resp.data.removeProject);
  });
});
