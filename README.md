# amone-core

AMONE 共通連携の本体(受付の仕組み)。

**AMONE の決まりの正本は [`docs/AMONE.md`](docs/AMONE.md)** です。新しく起動した AI は、まずここを読みます。

- `src/router.js` 振り分けの判断(純粋関数)。取消・重複防止・SHA照合。
- `src/intake.js` 受付コメントの組み立てと、ボットの記録の読み戻し。
- `src/registry.js` 登録台帳の1行登録を展開する。
- `scripts/intake.js` GitHub の出来事を読んで、多くても1件だけ書く。失敗してもやり直さない。
- `.github/actions/intake` 各プロジェクトから呼ぶ部品(コミット番号で固定して呼ぶ)。
- `collab/registry.json` 登録台帳。プロジェクトは `{ "repo": "owner/name" }` の1行で登録。
- `templates/collab-intake.yml` プロジェクトに置く短いファイルの見本。
- `docs/collab-design.md` 受付の設計と使い方。
- `docs/shortcut-amu-launch.md` アム Chat を起動する iPhone ショートカットの指示文(正本)。

```sh
npm test
```
合成データのみ。パスワード・鍵・個人データは置かない。
