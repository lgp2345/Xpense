/** 分页查询结果。 */
export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
