import importlib
try:
    m = importlib.import_module('backend.api.main')
    ready = getattr(m.app.state, 'models_ready', None)
    analyzer = getattr(m.app.state, 'analyzer', None)
    metrics = getattr(m.app.state, 'metrics_analyzer', None)
    print('models_ready=', ready)
    print('analyzer=', type(analyzer).__name__ if analyzer is not None else None)
    print('metrics_analyzer=', type(metrics).__name__ if metrics is not None else None)
except Exception as e:
    print('IMPORT_ERROR', e)
    import traceback
    traceback.print_exc()
