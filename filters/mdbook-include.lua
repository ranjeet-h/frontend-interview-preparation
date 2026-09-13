-- Expand mdBook's {{#include path:start:end}} directives at render time.
-- The Markdown source remains byte-for-byte intact, while Quarto receives the
-- same included ranges that mdBook used to inject before Pandoc ran.

local function input_file()
  if quarto and quarto.doc and quarto.doc.input_file then
    local value = quarto.doc.input_file
    if type(value) == "function" then value = value() end
    if value and value ~= "" then return value end
  end
  if PANDOC_STATE and PANDOC_STATE.input_files then
    return PANDOC_STATE.input_files[1]
  end
  return nil
end

local function read_lines(path)
  local handle = io.open(path, "r")
  if not handle then return nil end
  local text = handle:read("*a")
  handle:close()
  local lines = {}
  for line in (text .. "\n"):gmatch("(.-)\n") do
    table.insert(lines, line)
  end
  return lines
end

local function resolve_include(raw_path, source_path)
  local source_dir = source_path and pandoc.path.directory(source_path) or "."
  local candidate = pandoc.path.join({ source_dir, raw_path })
  if read_lines(candidate) then return candidate end

  -- The old source lived below src/, so legacy root files were referenced
  -- with ../../file.md. After moving content to the Quarto root, resolve that
  -- same directive against the project root without changing the source.
  local stripped = raw_path
  while stripped:match("^%.%./") do
    stripped = stripped:sub(4)
  end
  local project_roots = {
    os.getenv("QUARTO_PROJECT_DIR"),
    os.getenv("QUARTO_PROJECT_ROOT"),
    os.getenv("PWD"),
    ".",
  }
  for _, project_root in ipairs(project_roots) do
    if project_root and project_root ~= "" then
      local fallback = pandoc.path.join({ project_root, stripped })
      if read_lines(fallback) then return fallback end
    end
  end
  return nil
end

function Para(el)
  local text = pandoc.utils.stringify(el)
  local raw_path, first, last = text:match("^{{#include%s+([^:}]+):(%d+):(%d+)}}$")
  if not raw_path then
    raw_path = text:match("^{{#include%s+([^}]+)}}$")
  end
  if not raw_path then return nil end

  local source_path = input_file()
  local path = resolve_include(raw_path, source_path)
  if not path then
    error("mdbook-include: file not found: " .. raw_path)
  end

  local lines = read_lines(path)
  local start_line = tonumber(first) or 1
  local end_line = tonumber(last) or #lines
  local selected = {}
  for index = start_line, math.min(end_line, #lines) do
    table.insert(selected, lines[index])
  end

  local included = pandoc.read(table.concat(selected, "\n"), "markdown")
  return included.blocks
end
