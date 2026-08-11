// Dynamic segment but no regions: the common harmless case (a collection
// detail view, a form). Owns no rows, so it must not warn about sharing them.
export default function EventDetail() {
  return <article />;
}
