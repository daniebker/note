import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeNoteTags } from "./rehype-note-tags";

export function NoteMarkdown({
  content,
  onTagClick,
}: {
  content: string;
  onTagClick?: (tag: string) => void;
}) {
  const components: Components = {
    span({ node, className, children, ...props }) {
      const tag = node?.properties?.dataTag;
      if (typeof tag === "string") {
        if (!onTagClick) return <span className="note-tag">{children}</span>;
        return (
          <button
            className="note-tag"
            onClick={(e) => {
              e.stopPropagation();
              onTagClick(tag);
            }}
            type="button"
          >
            {children}
          </button>
        );
      }
      return (
        <span className={className} {...props}>
          {children}
        </span>
      );
    },
  };

  return (
    <ReactMarkdown
      components={components}
      rehypePlugins={[rehypeNoteTags]}
      remarkPlugins={[remarkGfm]}
    >
      {content}
    </ReactMarkdown>
  );
}
