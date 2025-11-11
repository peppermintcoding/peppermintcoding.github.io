import os
import argparse

def generate_html(title, body, next_link):
    return f"""
    <html>
        <head>
            <meta charset="UTF-8">
            <title>{title}</title>
            <style>
                @font-face {{
                    font-family: 'Myna';
                    src: url('fonts/Myna.otf') format('opentype');
                    font-weight: normal;
                    font-style: normal;
                }}
                body {{
                    font-family: Myna, Georgia, serif;
                    max-width: 700px;
                    margin: 60px auto;
                    line-height: 1.7;
                    color: #222;
                    padding: 0 15px;
                }}

                @media (max-width: 768px) {{
                    body {{
                        padding: 15px;
                        font-size: 16px;
                    }}
                }}

                a {{
                    color: #3366cc;
                    text-decoration: none;
                }}
                a:hover {{
                    text-decoration: underline;
                }}
                nav {{
                    margin-top: 40px;
                    text-align: right;
                }}
            </style>
        </head>
        <body>
            {body}
            {f'<nav><a href="{next_link}">Next →</a></nav>' if next_link else ""}
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
        html_content = generate_html(title, html_body, next_link)

        output_path = os.path.join(args.html, filename.replace(".md", ".html"))
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
