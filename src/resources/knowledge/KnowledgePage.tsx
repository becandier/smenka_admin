import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, usePermissions } from 'react-admin';
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  CircularProgress,
  Divider,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useCurrentOrg } from '../../orgContext';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import type { Permissions } from '../../providers/authProvider';
import { TreePanel } from './TreePanel';
import { BlockEditor } from './BlockEditor';
import { AccessPanel } from './AccessPanel';
import { useKnowledgeNode, useKnowledgeTree, useUpdateNode, knowledgeErrorCode } from './hooks';
import type { Breadcrumb, KnowledgeBlock, NodeDetail } from './types';

// Корневой экран «База знаний» (CustomRoutes /knowledge): двухпанельный кабинет —
// слева дерево (TreePanel), справа деталь выбранного узла (контент/доступ). Гейтинг:
// super_admin ИЛИ owner/admin выбранной org; employee в админку не заходит. ACL-панель
// доступна для этих ролей всегда (к ним ACL не применяется — управляют доступом employee).

// --- Заглушки доступа / выбора организации -------------------------------

const NoAccess = () => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      База знаний доступна владельцу и администратору организации.
    </Typography>
  </Box>
);

const PickOrg = () => (
  <Box sx={{ p: 3 }}>
    <Typography color="text.secondary">
      Выберите организацию в переключателе сверху, чтобы открыть её базу знаний.
    </Typography>
  </Box>
);

// --- Хлебные крошки узла --------------------------------------------------

const NodeBreadcrumbs = ({ items }: { items: Breadcrumb[] }) => {
  if (items.length === 0) return null;
  return (
    <Breadcrumbs sx={{ mb: 1 }}>
      {items.map((b, i) =>
        i === items.length - 1 ? (
          <Typography key={b.id} color="text.primary" variant="body2">
            {b.title}
          </Typography>
        ) : (
          <Typography key={b.id} color="text.secondary" variant="body2">
            {b.title}
          </Typography>
        ),
      )}
    </Breadcrumbs>
  );
};

// --- Редактор контента страницы (вкладка «Контент») ----------------------
// Локальный буфер блоков с явной кнопкой «Сохранить»: PATCH content привязывает/
// отвязывает файлы на бэке, поэтому сохраняем по действию пользователя, а не на каждый
// keystroke. Редактор ремонтируется по React key (node.id) при смене страницы.

interface ContentTabProps {
  node: NodeDetail;
  onSaved: () => void;
}

const ContentTab = ({ node, onSaved }: ContentTabProps) => {
  const { update, saving } = useUpdateNode();
  // Буфер изменений редактора; null — после монтирования/сохранения (нет несохранённых правок).
  const [draft, setDraft] = useState<KnowledgeBlock[] | null>(null);
  const dirty = draft !== null;

  // Сбрасываем буфер при смене узла (key ремонтирует ContentTab, но подстрахуемся).
  useEffect(() => {
    setDraft(null);
  }, [node.id]);

  const handleChange = useCallback((blocks: KnowledgeBlock[]) => {
    setDraft(blocks);
  }, []);

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    try {
      await update(node.id, { content: draft ?? [] });
      setDraft(null);
      onSaved();
    } catch {
      // notify по error.code показан в useUpdateNode; буфер сохраняем для повторной попытки.
    }
  }, [dirty, draft, node.id, update, onSaved]);

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={!dirty || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </Stack>
      <BlockEditor key={node.id} value={node.content} onChange={handleChange} />
    </Box>
  );
};

// --- Деталь выбранного узла (правая панель) ------------------------------

interface NodeDetailPaneProps {
  nodeId: string;
}

type DetailTab = 'content' | 'access';

const NodeDetailPane = ({ nodeId }: NodeDetailPaneProps) => {
  const { node, loading, error, refetch } = useKnowledgeNode(nodeId);
  const [tab, setTab] = useState<DetailTab>('content');

  // Для раздела вкладки контента нет — держим access активной.
  useEffect(() => {
    if (node?.kind === 'section') setTab('access');
    else setTab('content');
  }, [node?.kind, node?.id]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    const code = knowledgeErrorCode(error);
    const text =
      code === 'KNOWLEDGE_NODE_NOT_FOUND'
        ? 'Материал не найден — возможно, он удалён. Обновите дерево.'
        : 'Не удалось загрузить материал.';
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" gutterBottom>
          {text}
        </Typography>
        <Button size="small" onClick={refetch}>
          Повторить
        </Button>
      </Box>
    );
  }

  if (!node) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Материал не найден.</Typography>
      </Box>
    );
  }

  const isPage = node.kind === 'page';

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <NodeBreadcrumbs items={node.breadcrumbs} />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        {node.icon ? (
          <Typography component="span" sx={{ fontSize: 22, lineHeight: 1 }}>
            {node.icon}
          </Typography>
        ) : null}
        <Typography variant="h5" sx={{ wordBreak: 'break-word' }}>
          {node.title}
        </Typography>
      </Stack>

      <Tabs value={tab} onChange={(_, v: DetailTab) => setTab(v)} sx={{ mb: 1 }}>
        {isPage && <Tab value="content" label="Контент" />}
        <Tab value="access" label="Доступ" />
      </Tabs>
      <Divider sx={{ mb: 2 }} />

      {tab === 'content' && isPage && <ContentTab node={node} onSaved={refetch} />}
      {tab === 'access' && (
        // breadcrumbs включают сам узел последним элементом — предки это всё, кроме него.
        <AccessPanel nodeId={node.id} ancestors={node.breadcrumbs.slice(0, -1)} />
      )}
    </Box>
  );
};

// --- Основной экран -------------------------------------------------------

const KnowledgeWorkspace = () => {
  const { tree, loading, refetch } = useKnowledgeTree();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Множество существующих id — сбрасываем выбор, если выбранный узел исчез из дерева
  // (удалён каскадом/перемещён в другую org).
  const existingIds = useMemo(() => {
    const set = new Set<string>();
    const walk = (items: typeof tree) => {
      for (const item of items) {
        set.add(item.id);
        walk(item.children);
      }
    };
    walk(tree);
    return set;
  }, [tree]);

  useEffect(() => {
    if (selectedId && !loading && !existingIds.has(selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, existingIds, loading]);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  return (
    <Card sx={{ display: 'flex', height: 'calc(100vh - 140px)', minHeight: 480, overflow: 'hidden' }}>
      <Box
        sx={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <TreePanel
          tree={tree}
          loading={loading}
          selectedId={selectedId}
          onSelect={handleSelect}
          onTreeChanged={refetch}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {selectedId ? (
          <NodeDetailPane nodeId={selectedId} />
        ) : (
          <Box sx={{ p: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography color="text.secondary">
              Выберите раздел или страницу слева, чтобы открыть содержимое и доступ.
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  );
};

export const KnowledgePage = () => {
  const { permissions } = usePermissions<Permissions>();
  const { org } = useCurrentOrg();
  const myRole = useMyOrgRole();

  const isSuper = permissions?.role === 'super_admin';
  const canManage = isSuper || myRole === 'owner' || myRole === 'admin';

  // super_admin без выбранной org тоже должен сперва выбрать организацию (сквозной
  // доступ работает через OrgSwitcher → org_id в путях). canManage уже учитывает super_admin.
  let body: JSX.Element;
  if (!org) body = <PickOrg />;
  else if (!canManage) body = <NoAccess />;
  else body = <KnowledgeWorkspace />;

  return (
    <Box sx={{ p: 2 }}>
      <Title title="База знаний" />
      {body}
    </Box>
  );
};

export default KnowledgePage;
