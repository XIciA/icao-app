/** Ready resources become visible through an existing referenced path immediately.
 * Their installation time therefore participates in the content publication date. */
export function contentPublicationTime(releaseDate: string | Date | undefined, resources: { createdAt?: Date }[]) {
  const dates = [releaseDate, ...resources.map(row => row.createdAt)].flatMap(value => value ? [new Date(value).getTime()] : []).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : undefined;
}
