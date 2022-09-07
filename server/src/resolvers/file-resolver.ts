import { Resolver, Mutation, Arg, Query, Args } from "type-graphql";
import {
  File,
  PaginatedFilesResponse,
  GetFilesArgs,
} from "../models/file-type";
import { bucket } from "../googleStorage";

@Resolver((of) => File)
export class FileResolver {
  @Mutation((returns) => Boolean)
  async removeFile(@Arg("id") id: string) {
    const file = await bucket.file(id);
    await file.delete({ ignoreNotFound: true });
    return true;
  }

  @Query((returns) => File, { nullable: true })
  async file(@Arg("id") id: string) {
    const file = await bucket.file(id);
    if (!file) return null;
    return File.fromEntity(file);
  }

  @Query((returns) => PaginatedFilesResponse, {
    description: "Gets a paginated list of files",
  })
  async files(
    @Args((type) => GetFilesArgs)
    { index, limit, search, sortOrder, sortType }: Partial<GetFilesArgs>
  ) {
    const [files, nextQuery] = await bucket.getFiles({ autoPaginate: false });
    nextQuery;
    return PaginatedFilesResponse.fromEntity(files);
  }
}
