import { ObjectType, Field, Int, ArgsType, InputType } from "type-graphql";
import { File as GFile } from "@google-cloud/storage";
import { LongType } from "../scalars/long";
import { PaginatedResponse } from "./paginated-response";
import { SortOrder, FileSortType } from "../enums";

@ObjectType({ description: "Object representing a File" })
export class File {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  publicURL: string;

  @Field()
  mimeType: string;

  @Field((type) => LongType)
  created: number;

  @Field((type) => LongType)
  updated: number;

  @Field((type) => LongType)
  size: number;

  static fromEntity(file: GFile) {
    const toReturn = new File();
    toReturn.id = file.id!;
    toReturn.name = file.name;
    toReturn.publicURL = file.publicUrl();
    toReturn.created = new Date(file.metadata.timeCreated).getTime();
    toReturn.updated = new Date(file.metadata.timeUpdated).getTime();
    toReturn.size = file.metadata.size;
    return toReturn;
  }
}

@InputType()
export class UpdateFileInput {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field((type) => Boolean, { nullable: true })
  isPublic: boolean;

  constructor(initialization?: Partial<UpdateFileInput>) {
    if (initialization) Object.assign(this, initialization);
  }
}

@ArgsType()
export class GetFilesArgs {
  constructor(initialization?: Partial<GetFilesArgs>) {
    initialization && Object.assign(this, initialization);
  }

  @Field((type) => Int, { defaultValue: 0 })
  index: number = 0;

  @Field((type) => Int, { defaultValue: 10 })
  limit: number;

  @Field((type) => String, { nullable: true })
  search: string;

  @Field((type) => SortOrder, { defaultValue: SortOrder.asc })
  sortOrder: SortOrder;

  @Field((type) => FileSortType, { defaultValue: FileSortType.created })
  sortType: FileSortType;
}

@ObjectType({ description: "A page of wrapper of files" })
export class PaginatedFilesResponse extends PaginatedResponse(File) {
  static fromEntity(pages: GFile[]) {
    const toReturn = new PaginatedFilesResponse();
    toReturn.count = 0;
    toReturn.index = 0;
    toReturn.limit = 0;
    toReturn.data = pages.map((file) => File.fromEntity(file));
    return toReturn;
  }
}
