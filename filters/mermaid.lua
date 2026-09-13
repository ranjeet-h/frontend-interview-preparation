-- Render plain ```mermaid fences in .md chapters using Quarto's local
-- Mermaid runtime. Native {mermaid} cells require .qmd files, but this book
-- intentionally keeps every chapter as Markdown.

local function escape_html(text)
  return (text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

function CodeBlock(el)
  for _, class in ipairs(el.classes) do
    if class == "mermaid" then
      return pandoc.RawBlock(
        "html",
        '<pre class="mermaid mermaid-js">' .. escape_html(el.text) .. "</pre>"
      )
    end
  end
  return nil
end

function Pandoc(doc)
  quarto.doc.add_html_dependency({
    name = "quarto-mermaid",
    version = "1.0.0",
    scripts = {
      "../assets/mermaid/mermaid.min.js",
      "../assets/mermaid/mermaid-init.js",
    },
    stylesheets = { "../assets/mermaid/mermaid.css" },
    resources = {
      "../assets/mermaid/mermaid.min.js",
      "../assets/mermaid/mermaid-init.js",
      "../assets/mermaid/mermaid.css",
    },
  })
  return doc
end
