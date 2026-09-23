"""Replace only the API virtual host during an Ops release; preserve other sites."""
import pathlib
import re
import sys


def site_span(text):
    matches = list(re.finditer(r'^api\.readyoufife\.com \{\s*$', text, re.M))
    if len(matches) != 1:
        raise ValueError('expected exactly one API virtual host')
    start = matches[0].start()
    depth = 0
    for offset in range(text.index('{', start), len(text)):
        depth += (text[offset] == '{') - (text[offset] == '}')
        if depth == 0:
            return start, offset + 1
    raise ValueError('unclosed API virtual host')


def prepare(current, source):
    start, end = site_span(current)
    source_start, source_end = site_span(source)
    candidate = source[source_start:source_end]
    if 'handle_path /admin/* {' not in candidate:
        raise ValueError('Ops route missing from release source')
    return current[:start] + candidate + current[end:]


if __name__ == '__main__':
    current, source, output = map(pathlib.Path, sys.argv[1:])
    output.write_text(prepare(current.read_text(), source.read_text()))
