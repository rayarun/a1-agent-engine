#!/usr/bin/env python3
"""
Add Apache 2.0 copyright headers to all source files.

This script adds appropriate copyright headers to Go, Python, and TypeScript/JavaScript files
across the entire project. It skips files that already have headers.
"""

import os
import sys
from pathlib import Path

# Copyright header templates
GO_HEADER = """// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"""

PYTHON_HEADER = """# Copyright 2026 Arun Ray
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""

TS_HEADER = """// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"""

def has_copyright_header(content):
    """Check if file already has a copyright header."""
    return "Copyright" in content[:200] and "Licensed under the Apache" in content[:500]

def get_header_for_file(filepath):
    """Get appropriate header based on file extension."""
    if filepath.endswith('.go'):
        return GO_HEADER
    elif filepath.endswith('.py'):
        return PYTHON_HEADER
    elif filepath.endswith(('.ts', '.tsx', '.js', '.jsx')):
        return TS_HEADER
    return None

def process_file(filepath):
    """Add copyright header to a file if it doesn't have one."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Skip if already has header
        if has_copyright_header(content):
            return "skipped"

        # Get appropriate header
        header = get_header_for_file(filepath)
        if not header:
            return "skipped"

        # Add header
        new_content = header + content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return "added"
    except Exception as e:
        return f"error: {str(e)}"

def main():
    """Main entry point."""
    root_dir = Path('/Users/arun.ray/personal-projects/a1-agent-engine')

    # Directories to scan
    scan_dirs = [
        root_dir / 'services',
        root_dir / 'apps',
        root_dir / 'packages',
    ]

    # File extensions to process
    extensions = {'.go', '.py', '.ts', '.tsx', '.js', '.jsx'}

    # Directories to skip
    skip_dirs = {
        'node_modules', 'dist', 'build', '.next', '__pycache__',
        '.venv', 'vendor', '.git', '.terraform'
    }

    # Patterns to skip
    skip_patterns = {
        '_test.go', '.test.ts', '.test.js', '.spec.ts', '.spec.js',
        '.d.ts', '.pb.go', '.pb.ts', 'mock_', 'stubs.go'
    }

    stats = {'added': 0, 'skipped': 0, 'error': 0}

    print("🔄 Adding Apache 2.0 copyright headers to source files...\n")

    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue

        for filepath in scan_dir.rglob('*'):
            # Skip directories
            if filepath.is_dir():
                continue

            # Skip if in skip directories
            if any(skip_dir in filepath.parts for skip_dir in skip_dirs):
                continue

            # Skip if matches skip patterns
            if any(filepath.name.endswith(pattern) or pattern in filepath.name
                   for pattern in skip_patterns):
                continue

            # Process if matches extensions
            if filepath.suffix in extensions:
                result = process_file(str(filepath))

                if result == "added":
                    stats['added'] += 1
                    print(f"✅ {filepath.relative_to(root_dir)}")
                elif result == "skipped":
                    stats['skipped'] += 1
                else:
                    stats['error'] += 1
                    print(f"❌ {filepath.relative_to(root_dir)}: {result}")

    print(f"\n📊 Summary:")
    print(f"  ✅ Headers added: {stats['added']}")
    print(f"  ⏭️  Already have headers: {stats['skipped']}")
    print(f"  ❌ Errors: {stats['error']}")
    print(f"  📁 Total processed: {stats['added'] + stats['skipped']}")

if __name__ == '__main__':
    main()
