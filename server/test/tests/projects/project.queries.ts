export const GET_PROJECTS = `
query GET_PROJECTS {
  projects {
    data {
      id
      name
      created
      lastUpdated
    }
    limit
    index
    count
  }
}`;
