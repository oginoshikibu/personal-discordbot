import type { CommandInteraction } from "discord.js";
import * as d3 from 'd3';
import { getLastDayTimeline, insertTimeline } from "../tables/timelineTable";
import { createCanvas, loadImage } from 'canvas';
import { workKindSeeds } from "../../prisma/seed";


export const insertTimelineByCommand = async (interaction: CommandInteraction): Promise<void> => {
    console.log('start insertTimelineByCommand');
    const workKindContent = interaction.options.get('work-kind')?.value;
    const commentContent = interaction.options.get('comment')?.value
    console.log(`workKindContent: ${workKindContent}`);
    console.log(`commentContent: ${commentContent}`);

    if (!workKindContent || typeof workKindContent !== 'number') {
        await interaction.reply('Invalid work-kind value');
        return;
    }

    const comment = commentContent && typeof commentContent === 'string' ? commentContent : undefined;

    const { timeline, error } = await insertTimeline(workKindContent, new Date(), comment);
    if (timeline) {
        const message = await interaction.reply({
            content: `${workKindSeeds.find((workKindSeed) => workKindSeed.id === workKindContent)?.name} ${timeline.comment ? `${timeline.comment}` : ''}`, fetchReply: true
        });
        await message.react('👍');
    } else {
        await interaction.reply(`Failed to insert timeline: ${error.message}`);
    }

    console.log('end insertTimelineByCommand');
}

type DailyLog = { workKindName: string, timeDelta: number, comment: string };

// todo
const createChart = async (dailyLogs: DailyLog[]): Promise<Blob | null> => {
    // ref: https://observablehq.com/@d3/pie-chart/2

    // Specify the chart’s dimensions.
    const width = 928;
    const height = Math.min(width, 500);

    // Create the color scale.
    const color = d3.scaleOrdinal()
        .domain(workKindSeeds.map((workKindSeed) => workKindSeed.name))
        .range(d3.quantize(t => d3.interpolateSpectral(t * 0.8 + 0.1), workKindSeeds.length).reverse())

    // Create the pie layout and arc generator.
    const pie = d3.pie<DailyLog>()
        .sort(null)
        .value(d => d.timeDelta);

    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(Math.min(width, height) / 2 - 1);

    const labelRadius = (Math.min(width, height) / 2 - 1) * 0.8;

    // A separate arc generator for labels.
    const arcLabel = d3.arc()
        .innerRadius(labelRadius)
        .outerRadius(labelRadius);

    const arcs = pie(dailyLogs);

    // Create the SVG container.
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

    // Add a sector path for each value.
    svg.append("g")
        .attr("stroke", "white")
        .selectAll()
        .data(arcs)
        .join("path")
        .attr("fill", d => color(d.data.workKindName) as string)
        .attr("d", arc as unknown as string)
        .append("title")
        .text(d => `${d.data.workKindName}: ${d.data.comment}`);

    // Create a new arc generator to place a label close to the edge.
    // The label shows the value if there is enough room.
    svg.append("g")
        .attr("text-anchor", "middle")
        .selectAll()
        .data(arcs)
        .join("text")
        .attr("transform", d => `translate(${arcLabel.centroid(d as any)})`)
        .call(text => text.append("tspan")
            .attr("y", "-0.4em")
            .attr("font-weight", "bold")
            .text(d => d.data.workKindName))
        .call(text => text.filter(d => (d.endAngle - d.startAngle) > 0.25).append("tspan")
            .attr("x", 0)
            .attr("y", "0.7em")
            .attr("fill-opacity", 0.7)
            .text(d => d.data.comment));
    // Convert the SVG to a PNG image.
    const svgNode = svg.node();
    if (!svgNode) return null;

    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;

    const svgString = new XMLSerializer().serializeToString(svgNode);
    const image = await loadImage('data:image/svg+xml;base64,' + Buffer.from(svgString).toString('base64'));
    context.drawImage(image, 0, 0);

    return new Promise<Blob | null>((resolve) => {
        canvas.toBuffer((err, buffer) => {
            if (err) {
                resolve(null);
            } else {
                resolve(new Blob([buffer]));
            }
        });
    });
}

export const summaryTimelinePngByCommand = async (interaction: CommandInteraction): Promise<void> => {
    console.log('start summaryTimelinePngByCommand');

    await interaction.deferReply();

    const lastDayTimelines = await getLastDayTimeline();
    let prev = lastDayTimelines[0];
    const dailyLogs: DailyLog[] = lastDayTimelines.slice(1).map((timeline) => {
        const timeDelta = (timeline.startedAt.getTime() - prev.startedAt.getTime()) / 1000 / 60;
        const workKindName = workKindSeeds.find((workKindSeed) => workKindSeed.id === prev.workKindId)?.name ?? 'Unknown';
        const comment = prev.comment ?? '';
        prev = timeline;
        return { workKindName, timeDelta, comment };
    });

    const blob = await createChart(dailyLogs);
    if (!blob) {
        await interaction.reply('Failed to create a chart');
        return;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    await interaction.editReply({ files: [{ attachment: buffer, name: 'chart.png' }] });
    console.log('end summaryTimelinePngByCommand');

}