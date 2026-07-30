import re
import sys

with open(sys.argv[1]) as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines, 1):
    tags = re.findall(r'</?[a-zA-Z-]+', line)
    for tag in tags:
        if tag.startswith('</'):
            name = tag[2:]
            if stack and stack[-1] == name:
                stack.pop()
            elif stack:
                print(f'L{i}: expected </{stack[-1]}>, got {tag}')
                stack.pop()
        elif not tag.endswith('/>') and tag in ['view','scroll-view','swiper','swiper-item','text','image','button','input','picker','switch']:
            stack.append(tag)

if stack:
    print(f'Unclosed: {stack}')
else:
    print('OK - all tags balanced')
