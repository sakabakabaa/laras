import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbase-client', () => ({ default: {} }));
import { languageOf } from '@/lib/i18n';

describe('interface language', () => {
	it('validates untrusted auth-record language values', () => {
		expect(languageOf({ language: 'de' })).toBe('de');
		expect(languageOf({ language: 'en' })).toBe('en');
		expect(languageOf({ language: 'id' })).toBe('id');
		expect(languageOf(null)).toBe('id');
		expect(languageOf(undefined)).toBe('id');
		expect(languageOf({ role: 'faculty' })).toBe('id');
		expect(languageOf({ role: 'student' })).toBe('de');
		expect(languageOf({ role: 'student', language: null })).toBe('de');
		expect(languageOf({ role: 'student', language: 'invalid' })).toBe('de');
		expect(languageOf({ role: 'student', language: 'id' })).toBe('id');
		expect(languageOf({ language: 'invalid' })).toBe('id');
	});

	it('defines each translation key only once per language', () => {
		const source = ts.createSourceFile('i18n.ts', readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
		const duplicates: string[] = [];
		for (const statement of source.statements) {
			if (!ts.isVariableStatement(statement)) continue;
			for (const declaration of statement.declarationList.declarations) {
				if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
				const seen = new Set<string>();
				for (const property of declaration.initializer.properties) {
					if (!ts.isPropertyAssignment(property)) continue;
					const key = property.name.getText(source);
					if (seen.has(key)) duplicates.push(`${declaration.name.getText(source)}:${key}`);
					seen.add(key);
				}
			}
		}
		expect(duplicates).toEqual([]);
	});
});
