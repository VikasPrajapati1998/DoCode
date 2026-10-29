import { EditorSimpleWorker } from 'do/editor/common/services/editorSimpleWorker';
import { IEditorWorkerService, IUnicodeHighlightsResult } from 'do/editor/common/services/editorWorker';
import { IModelService } from 'do/editor/common/services/model';

let x: [IEditorWorkerService, EditorSimpleWorker, IModelService, IUnicodeHighlightsResult];