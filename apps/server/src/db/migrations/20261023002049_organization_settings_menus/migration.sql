-- 仅补充组织设置权限与菜单，保留已有名称、菜单位置及自定义角色授权。
INSERT INTO permissions (key,name,resource,action,description)
VALUES ('organization_settings:read','查看组织设置','organization_settings','read','查看组织设置'),
       ('organization_settings:update','维护组织资料','organization_settings','update','维护组织资料')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system=true AND r.organization_id IS NULL AND r.key='owner'
AND p.key IN ('organization_settings:read','organization_settings:update')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO menus (organization_id,parent_id,type,name,route_key,icon,permission_code,is_external,is_visible,keep_alive,sort_order)
SELECT o.id,NULL,'menu','组织设置','OrganizationSettings','Building2','organization_settings:read',false,true,false,
COALESCE((SELECT max(m.sort_order) FROM menus m WHERE m.organization_id=o.id AND m.parent_id IS NULL),0)+10
FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM menus m WHERE m.organization_id=o.id AND m.route_key='OrganizationSettings');
--> statement-breakpoint
INSERT INTO menus (organization_id,parent_id,type,name,permission_code,sort_order)
SELECT m.organization_id,m.id,'button','保存组织资料','organization_settings:update',
COALESCE((SELECT max(child.sort_order) FROM menus child WHERE child.organization_id=m.organization_id AND child.parent_id=m.id),0)+10
FROM menus m WHERE m.route_key='OrganizationSettings' AND m.type='menu' AND m.is_external=false
AND NOT EXISTS (SELECT 1 FROM menus child WHERE child.organization_id=m.organization_id AND child.parent_id=m.id AND child.permission_code='organization_settings:update');
