import { ObjectType, Field, Int, ArgsType, InputType } from "type-graphql";
import { LongType } from "../scalars/long";
import { PaginatedResponse } from "./paginated-response";

export type IProject = {
  id: string;
  name: string;
  created: number;
  last_updated: number;
};

@ObjectType({ description: "Object representing a Project" })
export class Project {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field((type) => LongType)
  created: number;

  @Field((type) => LongType)
  lastUpdated: number;

  static fromEntity(project: IProject) {
    const toReturn = new Project();
    toReturn.id = project.id!;
    toReturn.name = project.name;
    toReturn.created = project.created;
    toReturn.lastUpdated = project.last_updated;
    return toReturn;
  }
}

@InputType()
export class AddProjectInput {
  @Field()
  name: string;

  constructor(initialization?: Partial<AddProjectInput>) {
    if (initialization) Object.assign(this, initialization);
  }
}

@InputType()
export class UpdateProjectInput {
  @Field()
  id: string;

  @Field()
  name: string;

  constructor(initialization?: Partial<UpdateProjectInput>) {
    if (initialization) Object.assign(this, initialization);
  }
}

@ArgsType()
export class GetProjectsArgs {
  constructor(initialization?: Partial<GetProjectsArgs>) {
    initialization && Object.assign(this, initialization);
  }

  @Field((type) => Int, { defaultValue: 0 })
  index: number = 0;

  @Field((type) => Int, { defaultValue: 10 })
  limit: number;
}

@ObjectType({ description: "A page of wrapper of files" })
export class PaginatedProjectResponse extends PaginatedResponse(Project) {
  static fromEntity(
    pages: IProject[],
    limit: number,
    index: number,
    count: number
  ) {
    const toReturn = new PaginatedProjectResponse();
    toReturn.count = count;
    toReturn.index = index;
    toReturn.limit = limit;
    toReturn.data = pages.map((project) => Project.fromEntity(project));
    return toReturn;
  }
}
