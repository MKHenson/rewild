import { Resolver, Mutation, Arg, Query, Args } from "type-graphql";
import sql from "sql-template-strings";
import {
  Project,
  PaginatedProjectResponse,
  GetProjectsArgs,
  AddProjectInput,
  UpdateProjectInput,
  IProject,
} from "../models/project-type";
import { query } from "../db";

@Resolver((of) => Project)
export class ProjectResolver {
  @Mutation((returns) => Boolean)
  async removeProject(@Arg("id") id: string) {
    const results = await query<IProject>(
      sql`DELETE FROM "projects" WHERE id=${id}`
    );
    if (results.rowCount === 0) return false;
    return true;
  }

  @Mutation((returns) => Project, { nullable: true })
  async addProject(@Arg("project") project: AddProjectInput) {
    const now = Date.now() / 1000.0;
    const result = await query<IProject>(
      sql`INSERT INTO "projects"(name, created, last_updated) VALUES(${project.name}, to_timestamp(${now}), to_timestamp(${now}) ) RETURNING *`
    );
    if (result.rowCount === 0) return null;
    return Project.fromEntity(result.rows[0]);
  }

  @Mutation((returns) => Project, { nullable: true })
  async patchProject(@Arg("project") project: UpdateProjectInput) {
    const now = Date.now() / 1000.0;
    const result = await query<IProject>(
      sql`UPDATE "projects" SET name=${project.name}, last_updated=to_timestamp(${now}) WHERE id=${project.id} RETURNING *`
    );
    if (result.rowCount === 0) return null;
    return Project.fromEntity(result.rows[0]);
  }

  @Query((returns) => Project, { nullable: true })
  async project(@Arg("id") id: string) {
    const resp = await query<IProject>(
      sql`SELECT * FROM "projects" WHERE id=${id}`
    );
    if (resp.rowCount === 0) return null;
    return Project.fromEntity(resp.rows[0]);
  }

  @Query((returns) => PaginatedProjectResponse, {
    description: "Gets a paginated list of files",
  })
  async projects(
    @Args((type) => GetProjectsArgs)
    { index, limit }: Partial<GetProjectsArgs>
  ) {
    const resp = await query<IProject & { total: string }>(
      sql`SELECT *, count(*) OVER() AS total FROM "projects" LIMIT ${limit} OFFSET ${index}`
    );
    return PaginatedProjectResponse.fromEntity(
      resp.rows,
      limit!,
      index!,
      resp.rows.length ? parseInt(resp.rows[0].total) : 0
    );
  }
}
