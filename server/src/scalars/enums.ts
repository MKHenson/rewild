import { SortOrder, FileSortType } from "../enums";
import { registerEnumType } from "type-graphql";

registerEnumType(SortOrder, {
  name: "SortOrder",
});

registerEnumType(FileSortType, {
  name: "FileSortType",
  description: "The type of sorting performed when fetching files",
});
