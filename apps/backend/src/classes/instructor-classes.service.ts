import { Injectable } from '@nestjs/common';
import { ClassStatus } from '../generated/prisma/enums';
import { toSeoulDateString } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';

export type InstructorClassResponse = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  status: ClassStatus;
  subjectCount: number;
  assignment: {
    assignedFrom: string;
    assignedTo: string | null;
    current: boolean;
  };
};

@Injectable()
export class InstructorClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyClasses(
    instructorId: string,
  ): Promise<InstructorClassResponse[]> {
    const classes = await this.prisma.class.findMany({
      where: {
        archivedAt: null,
        programs: {
          some: { courseOffering: { instructorId } },
        },
      },
      include: {
        programs: {
          where: { courseOffering: { instructorId } },
          include: {
            courseOffering: true,
            classSubjects: { where: { active: true }, select: { id: true } },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
    });

    return classes.flatMap((classItem) =>
      classItem.programs.map((program) => ({
        id: classItem.id,
        courseOfferingId: program.courseOfferingId,
        courseOfferingName: program.courseOffering.name,
        name: classItem.name,
        room: classItem.room,
        startDate: this.toDateString(classItem.startDate),
        endDate: this.toDateString(classItem.endDate),
        status: classItem.status,
        subjectCount: program.classSubjects.length,
        assignment: {
          assignedFrom: this.toDateString(classItem.startDate),
          assignedTo: this.toDateString(classItem.endDate),
          current: true,
        },
      })),
    );
  }

  private toDateString(date: Date): string {
    return toSeoulDateString(date);
  }
}
