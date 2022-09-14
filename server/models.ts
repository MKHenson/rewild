export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  /** 64-bit integral numbers */
  Long: any;
};

/** Object representing a File */
export type File = {
  __typename?: 'File';
  id: Scalars['String'];
  name: Scalars['String'];
  publicURL: Scalars['String'];
  mimeType: Scalars['String'];
  created: Scalars['Long'];
  updated: Scalars['Long'];
  size: Scalars['Long'];
};

/** The type of sorting performed when fetching files */
export type FileSortType =
  | 'created'
  | 'memory'
  | 'name';


export type Mutation = {
  __typename?: 'Mutation';
  removeFile: Scalars['Boolean'];
};


export type MutationRemoveFileArgs = {
  id: Scalars['String'];
};

/** A page of wrapper of files */
export type PaginatedFilesResponse = {
  __typename?: 'PaginatedFilesResponse';
  data: Array<File>;
  count: Scalars['Int'];
  limit: Scalars['Int'];
  index: Scalars['Int'];
};

export type Query = {
  __typename?: 'Query';
  system: System;
  file?: Maybe<File>;
  /** Gets a paginated list of files */
  files: PaginatedFilesResponse;
};


export type QueryFileArgs = {
  id: Scalars['String'];
};


export type QueryFilesArgs = {
  index?: Maybe<Scalars['Int']>;
  limit?: Maybe<Scalars['Int']>;
  search?: Maybe<Scalars['String']>;
  sortOrder?: Maybe<SortOrder>;
  sortType?: Maybe<FileSortType>;
};

export type SortOrder =
  | 'asc'
  | 'desc';

/** Object representing the server system */
export type System = {
  __typename?: 'System';
  status: Scalars['String'];
};
