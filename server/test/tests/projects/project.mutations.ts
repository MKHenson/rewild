export const ADD_PROJECT = `
mutation ADD_PROJECT( $project: AddProjectInput! ) {
  project: addProject(project: $project){
    id
    name
    created
    lastUpdated
  }
}
`;

export const PATCH_PROJECT = `
mutation PATCH_PROJECT( $project: UpdateProjectInput! ) {
  project: patchProject(project: $project){
    id
    name
    created
    lastUpdated
  }
}
`;

export const REMOVE_PROJECT = `
mutation REMOVE_PROJECT( $id: String! ) {
  removeProject(id: $id)
}
`;
