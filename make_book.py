import os
import argparse

def generate_html(title, body, chapters, current_chapter, next_link=None):
    chapter_links = []
    chapter_links.append('<a href="../index.html">Home</a>')
    for chapter in chapters:
        chapter_name = os.path.splitext(chapter)[0].capitalize()
        chapter_link = f'<a href="{chapter.replace(".md", ".html")}">{chapter_name}</a>'
        chapter_links.append(chapter_link)
    chapter_links_str = "\n".join(chapter_links)
    return f"""
    <html>
        <head>
            <meta charset="UTF-8">
            <title>{title}</title>
            <link rel="stylesheet" href="../styles.css">
        </head>
        <body>
            <nav class="sidebar">
                <h2>{title}</h2>
                {chapter_links_str}
            </nav>
            <div class="content-wrapper">
                <main class="content">
                    {body}
                    {f'<nav><a href="{next_link}">Next →</a></nav>' if next_link else ""}
                </main>
            </div>
        </body>
    </html>
    """


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="create html files from markdown files")
    parser.add_argument("-md", type=str, help="folder with markdown")
    parser.add_argument("-html", type=str, help="folder to save the html")
    args = parser.parse_args()
    os.makedirs(args.html, exist_ok=True)
    chapters = sorted([f for f in os.listdir(args.md) if f.endswith(".md")])
    for i, filename in enumerate(chapters):
        filepath = os.path.join(args.md, filename)
        html_body = ["<p>"]
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f.readlines():
                html_body.append(line)
                html_body.append("<br>")
        html_body.append("</p>")
        html_body = "".join(html_body)
        next_link = None
        if i + 1 < len(chapters):
            next_link = chapters[i + 1].replace(".md", ".html")
        title = filename.replace(".md", "").capitalize()
        html_content = generate_html(title, html_body, chapters, filename, next_link)
        output_path = os.path.join(args.html, filename.replace(".md", ".html"))
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
