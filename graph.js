class KnowledgeGraph {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.svg = null;
        this.simulation = null;
        this.width = 0;
        this.height = 0;

        window.addEventListener('resize', () => this.handleResize());
    }

    init() {
        const rect = this.container.node().getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        this.svg = this.container.append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .call(d3.zoom().on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            }));

        this.g = this.svg.append('g');
    }

    update(data) {
        if (!this.svg) this.init();
        this.g.selectAll('*').remove();

        const { nodes, links } = this.processData(data);

        this.simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(40));

        const link = this.g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('class', d => `link ${d.type || ''}`);

        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(nodes)
            .enter().append('g')
            .call(d3.drag()
                .on('start', (e, d) => this.dragStarted(e, d))
                .on('drag', (e, d) => this.dragged(e, d))
                .on('end', (e, d) => this.dragEnded(e, d)));

        node.append('circle')
            .attr('r', d => (d.group === 'category' ? 12 : 8))
            .attr('class', 'node')
            .attr('fill', d => this.getColor(d.category));

        node.append('text')
            .attr('dx', 15)
            .attr('dy', '.35em')
            .attr('class', 'node-label')
            .text(d => d.title);

        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
    }

    processData(rawActivities) {
        const nodes = [];
        const links = [];
        const categories = new Set();

        // 1. Create Data Nodes and Categorize
        rawActivities.forEach((act, index) => {
            const nodeId = `note-${index}`;
            nodes.push({
                id: nodeId,
                title: act.title,
                category: act.category,
                group: 'note'
            });
            categories.add(act.category);
        });

        // 2. Create Category Hubs
        categories.forEach(cat => {
            nodes.push({
                id: `cat-${cat}`,
                title: cat,
                category: cat,
                group: 'category'
            });

            // Link notes to their category
            nodes.forEach(n => {
                if (n.group === 'note' && n.category === cat) {
                    links.push({ source: n.id, target: `cat-${cat}` });
                }
            });
        });

        // 3. Process explicit wikilinks [[ ]] for direct note-to-note linking
        rawActivities.forEach((act, index) => {
            const sourceId = `note-${index}`;
            const wikilinks = act.wikilinks || [];

            wikilinks.forEach(targetTitle => {
                // Find node with matching title
                const targetNode = nodes.find(n => n.group === 'note' && n.title === targetTitle);
                if (targetNode) {
                    links.push({
                        source: sourceId,
                        target: targetNode.id,
                        type: 'direct'
                    });
                }
            });
        });

        return { nodes, links };
    }

    getColor(category) {
        const colors = {
            'AI 강의': '#38bdf8',
            '재무': '#10b981',
            'Pixel Rest': '#f472b6',
            '업무': '#fbbf24',
            '개인': '#a78bfa',
            '기타': '#94a3b8'
        };
        return colors[category] || '#6366f1';
    }

    dragStarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragEnded(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    handleResize() {
        if (!this.svg) return;
        const rect = this.container.node().getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        if (this.simulation) {
            this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }
}

// Global instance
const synapseGraph = new KnowledgeGraph('#graph-container');
