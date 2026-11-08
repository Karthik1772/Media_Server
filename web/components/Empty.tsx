export function Empty({ query }: { query: string }) {
  return (
    <div className="py-[70px] text-center text-base text-mute">
      <div className="mb-2 animate-floaty text-[46px]">{query ? "\u{1F50D}" : "\u{1F4C2}"}</div>
      <div>{query ? `No matches for "${query}"` : "Nothing here."}</div>
    </div>
  );
}
