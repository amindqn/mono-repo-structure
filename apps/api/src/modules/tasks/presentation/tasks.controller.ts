import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CreateTask } from '../application/create-task.js';
import { ChangeTaskStatus } from '../application/change-task-status.js';
import { ListTasks } from '../application/list-tasks.js';
import { CreateTaskDto, TaskDto, TaskListDto, UpdateTaskDto } from './task.dto.js';
import { CurrentUserId } from '../../../common/auth-context.js';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    @Inject(CreateTask) private readonly createTask: CreateTask,
    @Inject(ListTasks) private readonly listTasks: ListTasks,
    @Inject(ChangeTaskStatus) private readonly changeTaskStatus: ChangeTaskStatus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the 100 most recent tasks' })
  @ZodResponse({ type: TaskListDto })
  async list(@CurrentUserId() ownerId: string) {
    return { items: (await this.listTasks.execute(ownerId)).map((task) => task.toSnapshot()) };
  }

  @Post()
  @ApiBody({ type: CreateTaskDto })
  @ZodResponse({ status: 201, type: TaskDto })
  async create(@Body() input: CreateTaskDto, @CurrentUserId() ownerId: string) {
    return (await this.createTask.execute(input.title, ownerId)).toSnapshot();
  }

  @Patch(':id')
  @ApiBody({ type: UpdateTaskDto })
  @ZodResponse({ type: TaskDto })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateTaskDto,
    @CurrentUserId() ownerId: string,
  ) {
    return (await this.changeTaskStatus.execute(id, input.status, ownerId)).toSnapshot();
  }
}
